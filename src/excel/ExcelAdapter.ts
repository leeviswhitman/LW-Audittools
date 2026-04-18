/**
 * Excel 数据交互封装层 - ExcelAdapter
 *
 * 封装所有 Office.js / Excel JavaScript API 调用，将 Excel 操作
 * 与业务逻辑解耦。所有业务模块只通过此层与 Excel 交互。
 *
 * 性能原则：
 * - 批量读取整个 Range，避免逐单元格操作
 * - 批量写入时使用 values 属性批量赋值
 * - 大数据量时分批（chunk）处理，避免阻塞 UI
 */

/** 工作表基本信息 */
export interface SheetInfo {
  name: string;
  index: number;
  rowCount: number;
  columnCount: number;
  isVisible: boolean;
}

/** Range 数据（二维数组，行优先） */
export type RawSheetData = (string | number | boolean | null)[][];

/**
 * Excel 适配器 - 封装 Office.js API
 */
export class ExcelAdapter {
  /**
   * 获取当前工作簿中所有工作表的基本信息
   */
  static async getSheetList(): Promise<SheetInfo[]> {
    return Excel.run(async (context) => {
      const sheets = context.workbook.worksheets;
      sheets.load('items/name,items/index,items/visibility');
      await context.sync();

      const results: SheetInfo[] = [];
      let sheetIndex = 0;
      for (const sheet of sheets.items) {
        // 获取已用区域以估算行列数
        const usedRange = sheet.getUsedRange(true);
        usedRange.load('rowCount,columnCount');
        try {
          await context.sync();
          results.push({
            name: sheet.name,
            index: sheetIndex,
            rowCount: usedRange.rowCount ?? 0,
            columnCount: usedRange.columnCount ?? 0,
            isVisible: sheet.visibility === Excel.SheetVisibility.visible,
          });
        } catch {
          // 空表无 usedRange
          results.push({
            name: sheet.name,
            index: sheetIndex,
            rowCount: 0,
            columnCount: 0,
            isVisible: sheet.visibility === Excel.SheetVisibility.visible,
          });
        }
        sheetIndex++;
      }
      return results;
    });
  }

  /**
   * 读取工作表数据（批量读取，性能友好）
   * @param sheetName 工作表名称
   * @param startRow 起始行（1-based，默认 1）
   * @param startCol 起始列（1-based，默认 1）
   * @param endRow 结束行（null=自动检测）
   * @param endCol 结束列（null=自动检测）
   * @param maxRows 最大读取行数（防止百万行意外读取，默认 100000）
   */
  static async readSheetData(
    sheetName: string,
    startRow = 1,
    startCol = 1,
    endRow?: number,
    endCol?: number,
    maxRows = 100000
  ): Promise<RawSheetData> {
    return Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(sheetName);
      const usedRange = sheet.getUsedRange(true);
      usedRange.load('rowCount,columnCount,address');
      await context.sync();

      const totalRows = Math.min(usedRange.rowCount, maxRows);
      const totalCols = usedRange.columnCount;

      if (totalRows === 0 || totalCols === 0) return [];

      const actualEndRow = endRow ? Math.min(endRow, totalRows) : totalRows;
      const actualEndCol = endCol ? Math.min(endCol, totalCols) : totalCols;

      // 构建 A1 表示法地址
      const startAddr = ExcelAdapter.cellAddress(startRow, startCol);
      const endAddr = ExcelAdapter.cellAddress(actualEndRow, actualEndCol);

      const range = sheet.getRange(`${startAddr}:${endAddr}`);
      range.load('values');
      await context.sync();

      return range.values as RawSheetData;
    });
  }

  /**
   * 读取指定工作表表头行
   * @param sheetName 工作表名
   * @param headerRow 表头行号（1-based，默认 1）
   */
  static async readHeaderRow(
    sheetName: string,
    headerRow = 1
  ): Promise<string[]> {
    const data = await ExcelAdapter.readSheetData(
      sheetName,
      headerRow,
      1,
      headerRow,
      undefined
    );
    if (data.length === 0) return [];
    return data[0].map((v) => (v === null || v === undefined ? '' : String(v).trim()));
  }

  /**
   * 在工作簿中新建工作表并写入数据
   * @param sheetName 新工作表名称（若已存在则在末尾加序号）
   * @param headers 表头数组
   * @param rows 数据行（二维数组）
   * @param disclaimer 是否在第一行添加审计免责声明
   * @returns 实际创建的工作表名称
   */
  static async writeNewSheet(
    sheetName: string,
    headers: string[],
    rows: (string | number | boolean | null)[][],
    disclaimer = true
  ): Promise<string> {
    return Excel.run(async (context) => {
      // 处理重名
      const actualName = await ExcelAdapter.getUniqueSheetName(
        context,
        sheetName
      );
      const newSheet = context.workbook.worksheets.add(actualName);

      let writeRow = 1;

      // 添加审计免责声明
      if (disclaimer) {
        const disclaimerText =
          '【系统提示】以下内容为系统生成草稿，需项目组复核后使用。本结果仅为程序辅助，审计结论由注册会计师做出职业判断。';
        const disclaimerRange = newSheet.getRange('A1');
        disclaimerRange.values = [[disclaimerText]];
        disclaimerRange.format.font.color = '#CC0000';
        disclaimerRange.format.font.bold = true;
        writeRow = 2;
      }

      // 写表头
      if (headers.length > 0) {
        const headerRange = newSheet.getRangeByIndexes(
          writeRow - 1,
          0,
          1,
          headers.length
        );
        headerRange.values = [headers];
        headerRange.format.font.bold = true;
        headerRange.format.fill.color = '#D9E1F2';
        writeRow++;
      }

      // 批量写数据（分批处理，每批 5000 行）
      const CHUNK_SIZE = 5000;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        if (chunk.length === 0 || headers.length === 0) continue;
        const dataRange = newSheet.getRangeByIndexes(
          writeRow - 1 + i,
          0,
          chunk.length,
          headers.length
        );
        dataRange.values = chunk;
      }

      // 自动调整列宽
      newSheet.getUsedRange(true).format.autofitColumns();

      newSheet.activate();
      await context.sync();

      return actualName;
    });
  }

  /**
   * 高亮指定行（用于标记异常行）
   * @param sheetName 工作表名
   * @param rowIndexes 1-based 行号数组
   * @param color 填充颜色（十六进制，默认黄色警告）
   */
  static async highlightRows(
    sheetName: string,
    rowIndexes: number[],
    color = '#FFF2CC'
  ): Promise<void> {
    if (rowIndexes.length === 0) return;
    return Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(sheetName);
      const usedRange = sheet.getUsedRange(true);
      usedRange.load('columnCount');
      await context.sync();

      for (const rowIdx of rowIndexes) {
        const range = sheet.getRangeByIndexes(
          rowIdx - 1,
          0,
          1,
          usedRange.columnCount
        );
        range.format.fill.color = color;
      }
      await context.sync();
    });
  }

  /**
   * 获取当前选中的区域数据
   */
  static async getSelectedRangeData(): Promise<RawSheetData> {
    return Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      range.load('values');
      await context.sync();
      return range.values as RawSheetData;
    });
  }

  /**
   * 获取当前活动工作表名称
   */
  static async getActiveSheetName(): Promise<string> {
    return Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      sheet.load('name');
      await context.sync();
      return sheet.name;
    });
  }

  // ─── 私有工具方法 ────────────────────────────────────────────

  /**
   * 将行列号转为 Excel 列字母地址（如 1,1 → "A1"）
   */
  private static cellAddress(row: number, col: number): string {
    return `${ExcelAdapter.colIndexToLetter(col)}${row}`;
  }

  /**
   * 列号转列字母（1 → "A", 26 → "Z", 27 → "AA"）
   */
  private static colIndexToLetter(col: number): string {
    let result = '';
    while (col > 0) {
      const rem = (col - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      col = Math.floor((col - 1) / 26);
    }
    return result;
  }

  /**
   * 获取唯一不重名的工作表名
   */
  private static async getUniqueSheetName(
    context: Excel.RequestContext,
    baseName: string
  ): Promise<string> {
    const sheets = context.workbook.worksheets;
    sheets.load('items/name');
    await context.sync();

    const existingNames = new Set(sheets.items.map((s) => s.name));
    if (!existingNames.has(baseName)) return baseName;

    let counter = 2;
    while (existingNames.has(`${baseName}(${counter})`)) {
      counter++;
    }
    return `${baseName}(${counter})`;
  }
}
