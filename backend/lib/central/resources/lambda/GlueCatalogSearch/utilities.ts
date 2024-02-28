import { Table } from "@aws-sdk/client-glue";

// TODO add facetting
export interface TableSearchInformation {
    catalogName: string;
    databaseName: string;
    tableName: string;
    columnNames?: string[];
    tableDescription?: Table;
}

export function tableToOpensearchId(table: TableSearchInformation): string {
    return `${table.catalogName}_${table.databaseName}_${table.tableName}`;
}

export function glueTableToTableSearchInformation(
    glueTable: Table
): TableSearchInformation {
    return {
        catalogName: glueTable.CatalogId ?? "",
        databaseName: glueTable.DatabaseName ?? "",
        tableName: glueTable.Name!,
        columnNames:
            glueTable.StorageDescriptor?.Columns?.map(
                (column) => column.Name!
            ) ?? [],
        tableDescription: glueTable,
    };
}
