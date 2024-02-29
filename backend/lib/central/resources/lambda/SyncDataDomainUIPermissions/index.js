const { GlueClient, GetDatabasesCommand } = require("@aws-sdk/client-glue")
const { LakeFormationClient, BatchGrantPermissionsCommand } = require("@aws-sdk/client-lakeformation")

const GLUE_MAX_RESULTS = 100;
const BATCH_GRANT_MAX_SIZE = 20;

function sliceIntoChunks(arr, chunkSize) {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        res.push(chunk);
    }
    return res;
}

exports.handler = async(event) => {
    const roleToGrant = process.env.ROLE_TO_GRANT;

    const glueClient = new GlueClient()
    let databases = [];
    let nextToken = null;

    do {
        const dbResp = await glueClient.send(new GetDatabasesCommand({MaxResults: GLUE_MAX_RESULTS, NextToken: nextToken}))

        databases = databases.concat(dbResp.DatabaseList)

        nextToken = dbResp.NextToken
    } while (nextToken != null);

    if (databases.length > 0) {
        const entriesFlat = databases.filter((row) => row.Name.includes("data-domain")).map((row, index) => {
            return {
                Id: index+"",
                Permissions: [
                    "DESCRIBE"
                ],
                Principal: {
                    DataLakePrincipalIdentifier: roleToGrant
                },
                Resource: {
                    Table: {
                        DatabaseName: row.Name,
                        CatalogId: row.CatalogId,
                        TableWildcard: {}
                    }
                }
            }
        });

        const entriesChunked = sliceIntoChunks(entriesFlat, BATCH_GRANT_MAX_SIZE)
        const lfClient = new LakeFormationClient()
        entriesChunked.forEach(async(batch) => {
            await lfClient.send(new BatchGrantPermissionsCommand({Entries: batch}))
        });
    }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        },
        "body": JSON.stringify({
            "result": `Synchronized ${databases.length} domains`
        })
    }
}