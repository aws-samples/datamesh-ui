import {
    GetDatabasesRequest,
    GetTableRequest,
    GetTablesRequest,
    TableList,
    DatabaseList,
} from "aws-sdk/clients/glue";
import * as AWS from "aws-sdk";
import axios, { AxiosError, AxiosResponse } from "axios";
import { aws4Interceptor } from "aws4-axios";

const opensearchDomainEndpoint = process.env.DOMAIN_ENDPOINT;
const awsRegion = process.env.AWS_REGION;
const CatalogId = process.env.accountId;

AWS.config.update({ region: awsRegion });

const interceptor = aws4Interceptor({
    region: awsRegion,
    service: "es",
});

axios.interceptors.request.use(interceptor);

var glue = new AWS.Glue();

async function deleteIndex(indexName: string): Promise<AxiosResponse> {
    return axios.delete(`https://${opensearchDomainEndpoint}/${indexName}`);
}

async function createIndex(indexName: string): Promise<AxiosResponse> {
    return axios.put(
        `https://${opensearchDomainEndpoint}/${indexName}`,
        {
            mappings: {
                properties: {
                    catalogName: {
                        type: "search_as_you_type",
                    },
                    databaseName: {
                        type: "search_as_you_type",
                    },
                    tableName: {
                        type: "search_as_you_type",
                    },
                    columnNames: {
                        type: "search_as_you_type",
                    },
                },
            },
        },
        {
            headers: {
                "Content-Type": "application/json",
            },
        }
    );
}

exports.handler = async (): Promise<void> => {
    // Part 1: (Re-)create index
    const indexName = process.env.OPENSEARCH_INDEX;

    if (!indexName) {
        throw "OPENSEARCH_INDEX env variable is not set!";
    }

    try {
        // Attempt to delete the index
        await deleteIndex(indexName);
        console.log(`Deleted the index "${indexName}"`);
    } catch (error) {
        // If index doesn't exist, we will get the expected 404. In other cases, we got an unexpected error
        if ((error as AxiosError).response?.status != 404) {
            throw error;
        }
    }

    await createIndex(indexName);
    console.log(`Created the index "${indexName}"`);

    // Part 2: Index all databases and corresponding tables

    interface TableSearchInformation {
        catalogName?: string;
        databaseName?: string;
        tableName?: string;
        columnNames?: string[];
        tableDescription?: AWS.Glue.Table;
        tableList?: TableList;
        databaseList?: DatabaseList;
        NextToken?: string;
    }

    // Get All Databases that are visibile to the account doing the call.
    let databases_params: GetDatabasesRequest = {
        CatalogId: CatalogId,
        MaxResults: 100,
    };
    try {
        await getDatabases(databases_params); //Add back
    } catch (error) {
        console.log("ERROR: Unable to get databases." + error);
    }

    // Loop through all the databases and get all their respective tables.
    async function getDatabases(databases_params: GetDatabasesRequest) {
        let databases: string[];
        let data: TableSearchInformation = await getDatabasesInformation(
            databases_params
        );
        if (data.databaseList) {
            databases = data.databaseList.map((database) => database.Name);
            for (const database of databases) {
                let tables_params: GetTablesRequest = {
                    DatabaseName: database,
                    CatalogId: CatalogId,
                    MaxResults: 100,
                };
                let tableList = await getTableList(tables_params);
                await getTable(tableList, database);
            }
        }
    }

    // Loop through all the tables and get their information
    async function getTable(data: TableSearchInformation, database: string) {
        let tables: string[];
        if (data.tableList) {
            tables = data.tableList.map((table) => table.Name);

            for (const table of tables) {
                let table_params: GetTableRequest = {
                    DatabaseName: database.toLowerCase(),
                    CatalogId: CatalogId,
                    Name: table,
                };
                let tableInformation: TableSearchInformation =
                    await getTableInformation(table_params);

                await indexTable(tableInformation);

                console.log(
                    `Indexed table ${tableToOpensearchId(tableInformation)}`
                );
            }
        }
    }

    async function getDatabasesInformation(
        database_params: TableSearchInformation
    ): Promise<TableSearchInformation> {
        const response = await glue.getDatabases(database_params).promise();
        //TODO check if no databases returned
        console.log(response.DatabaseList);
        if (response.DatabaseList.length === 0) {
            console.log(
                "Database list is empty, please validate that the actual Lambda Role has Lakeformation permissions to see the databases and tables."
            );
        }

        if (!response.DatabaseList) {
            throw new Error(`No databases found`);
        }
        return glueDatabaseToTableSearchInformation(response.DatabaseList);
    }

    async function getTableInformation(
        table_params: GetTableRequest
    ): Promise<TableSearchInformation> {
        const response = await glue.getTable(table_params).promise();
        if (!response.Table) {
            throw new Error(`No table found`);
        }
        return glueTableToTableSearchInformation(response.Table);
    }

    async function getTableList(tables_params: GetTablesRequest): Promise<any> {
        const response = await glue.getTables(tables_params).promise();

        if (!response.TableList) {
            throw new Error(`Unable retrieve tables`);
        }
        return glueTableListToTableSearchInformation(response.TableList);
    }

    function glueTableToTableSearchInformation(
        glueTable: AWS.Glue.Table
    ): TableSearchInformation {
        return {
            catalogName: glueTable.CatalogId ?? "",
            databaseName: glueTable.DatabaseName ?? "",
            tableName: glueTable.Name,
            columnNames:
                glueTable.StorageDescriptor?.Columns?.map(
                    (column) => column.Name
                ) ?? [],
            tableDescription: glueTable,
        };
    }

    function glueTableListToTableSearchInformation(
        glueTableList: AWS.Glue.TableList
    ): TableSearchInformation {
        return {
            tableList: glueTableList,
        };
    }

    function glueDatabaseToTableSearchInformation(
        glueDatabaseList: AWS.Glue.DatabaseList
    ): TableSearchInformation {
        return {
            databaseList: glueDatabaseList,
        };
    }

    async function indexTable(tableInformation: TableSearchInformation) {
        await axios.post(
            `https://${opensearchDomainEndpoint}/${
                process.env.OPENSEARCH_INDEX
            }/_doc/${tableToOpensearchId(tableInformation)}`,
            tableInformation,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }

    function tableToOpensearchId(table: TableSearchInformation): string {
        return `${table.catalogName}_${table.databaseName}_${table.tableName}`;
    }
};
