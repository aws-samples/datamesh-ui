import { EventBridgeEvent } from "aws-lambda";
import axios from "axios";
import { aws4Interceptor } from "aws4-axios";
import * as AWS from "aws-sdk";
import {
    TableSearchInformation,
    tableToOpensearchId,
    glueTableToTableSearchInformation,
} from "../utilities";

const opensearchDomainEndpoint = process.env.DOMAIN_ENDPOINT;
const awsRegion = process.env.AWS_REGION;

const interceptor = aws4Interceptor({
    region: awsRegion,
    service: "aoss",
});

axios.interceptors.request.use(interceptor);

const glue = new AWS.Glue({ apiVersion: "2017-03-31" });

interface BaseGlueChangeEventDetail {
    typeOfChange: string;
    databaseName: string;
}

interface GlueDatabaseChangeEventDetail extends BaseGlueChangeEventDetail {
    changedTables: string[];
}

interface GlueTableChangeEventDetail extends BaseGlueChangeEventDetail {
    tableName: string;
    changedPartitions?: string[];
}

type GlueDatabaseChangeEvent = EventBridgeEvent<
    "Glue Data Catalog Database State Change",
    GlueDatabaseChangeEventDetail
>;

type GlueTableChangeEvent = EventBridgeEvent<
    "Glue Data Catalog Table State Change",
    GlueTableChangeEventDetail
>;

function isTableChangeEvent(
    eventDetail: GlueDatabaseChangeEvent | GlueTableChangeEvent
): eventDetail is GlueTableChangeEvent {
    return (eventDetail as GlueTableChangeEvent).detail.tableName !== undefined;
}

async function getTableInformationFromGlueCatalog(
    databaseName: string,
    tableName: string
): Promise<TableSearchInformation> {
    const response = await glue
        .getTable({
            DatabaseName: databaseName,
            Name: tableName,
        })
        .promise();

    if (!response.Table) {
        throw new Error(`No table found for ${databaseName}.${tableName}`);
    }

    return glueTableToTableSearchInformation(response.Table);
}

async function onCreateTable(event: GlueDatabaseChangeEvent) {
    const { databaseName, changedTables } = event.detail;

    const tableInformation = await Promise.all(
        changedTables.map((table) =>
            getTableInformationFromGlueCatalog(databaseName, table)
        )
    );

    return Promise.all(
        tableInformation.map((table) =>
            axios.post(
                `https://${opensearchDomainEndpoint}/${
                    process.env.OPENSEARCH_INDEX
                }/_doc/${tableToOpensearchId(table)}`,
                table,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            )
        )
    );
}

async function onUpdateTable(event: GlueTableChangeEvent) {
    const { databaseName, tableName } = event.detail;

    const tableInformation = await getTableInformationFromGlueCatalog(
        databaseName,
        tableName
    );

    return axios.put(
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

async function onDeleteTables(event: GlueDatabaseChangeEvent) {
    const { databaseName } = event.detail;
    const tableArns = event.resources;
    const deletedCatalogTables: TableSearchInformation[] = tableArns.map(
        (arn) => {
            // The table ARN has the following form 'arn:aws:glue:<region>:<accountNumber>:table/<databaseName>/<tableName>'
            return {
                catalogName: arn.split(":")[4],
                databaseName,
                tableName: arn.split("/")[2],
            };
        }
    );

    console.log(
        `Deleting the tables: ${deletedCatalogTables
            .map(tableToOpensearchId)
            .join(", ")}`
    );

    return Promise.all(
        deletedCatalogTables.map((table) =>
            axios.delete(
                `https://${opensearchDomainEndpoint}/${
                    process.env.OPENSEARCH_INDEX
                }/_doc/${tableToOpensearchId(table)}`,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            )
        )
    );
}

async function getDatabaseTableIds(databaseName: string): Promise<string[]> {
    const searchResponse = await axios.post(
        `https://${opensearchDomainEndpoint}/${process.env.OPENSEARCH_INDEX}/_search`,
        {
            query: {
                match: {
                    databaseName: databaseName,
                },
            },
        },
        {
            headers: {
                "Content-Type": "application/json",
            },
        }
    );

    const searchHits: { _id: string }[] = searchResponse.data.hits?.hits ?? [];
    if (searchHits.length == 0) {
        return [];
    }
    return searchHits.map((searchHit) => searchHit._id);
}

async function onDeleteDatabase(event: GlueDatabaseChangeEvent) {
    const { databaseName } = event.detail;

    // The database ARN has the following form 'arn:aws:glue:<region>:<catalogName>:database/<databaseName>'
    const catalogName = event.resources[0].split(":")[4];

    console.log(
        `Searching for tables of database ${databaseName} from the catalog ${catalogName} to delete them.`
    );

    const tableIdsToDelete = await getDatabaseTableIds(databaseName);

    console.log(`Deleting the tables: ${tableIdsToDelete.join(", ")}`);

    return Promise.all(
        tableIdsToDelete.map((tableId) =>
            axios.delete(
                `https://${opensearchDomainEndpoint}/${process.env.OPENSEARCH_INDEX}/_doc/${tableId}`,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            )
        )
    );
}

// TODO - needs to be rewritten as a Step Function or queue
exports.handler = async (
    event: GlueDatabaseChangeEvent | GlueTableChangeEvent
): Promise<void> => {
    console.log(event);

    try {
        if (isTableChangeEvent(event)) {
            switch (event.detail.typeOfChange) {
                case "UpdateTable": {
                    const response = await onUpdateTable(event);
                    const updatedTable = response.data._id;
                    console.log(
                        `Updated the following table in index ${process.env.OPENSEARCH_INDEX}: ${updatedTable}`
                    );
                    break;
                }
            }
            console.log("Table change event - ignoring - WIP");
        } else {
            switch (event.detail.typeOfChange) {
                case "CreateTable": {
                    const responses = await onCreateTable(event);
                    const createdTables = responses.map(
                        (response) => response.data._id
                    );
                    console.log(
                        `Created the following tables in index ${
                            process.env.OPENSEARCH_INDEX
                        }: ${createdTables.join(", ")}`
                    );
                    break;
                }
                case "DeleteDatabase": {
                    const responses = await onDeleteDatabase(event);
                    const deletedTables = responses.map(
                        (response) => response.data._id
                    );
                    console.log(
                        `Deleted the following tables in index ${
                            process.env.OPENSEARCH_INDEX
                        }: ${deletedTables.join(", ")}`
                    );
                    break;
                }
                case "DeleteTable":
                case "BatchDeleteTable": {
                    const responses = await onDeleteTables(event);
                    const deletedTables = responses.map(
                        (response) => response.data._id
                    );
                    console.log(
                        `Deleted the following tables in index ${
                            process.env.OPENSEARCH_INDEX
                        }: ${deletedTables.join(", ")}`
                    );
                    break;
                }
                default: {
                    // Ignore events like create partition index or update column statistics
                    console.log(
                        `Unhandled event "${event.detail.typeOfChange}"`
                    );
                    break;
                }
            }
        }
    } catch (error) {
        console.log(error);
    }
};
