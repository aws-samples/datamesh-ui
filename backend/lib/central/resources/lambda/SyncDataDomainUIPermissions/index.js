const AWS = require("aws-sdk");

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

    const glueClient = new AWS.Glue();
    let databases = [];
    let nextToken = null;

    do {
        const dbResp = await glueClient.getDatabases({MaxResults: GLUE_MAX_RESULTS, NextToken: nextToken}).promise();

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
        const lfClient = new AWS.LakeFormation();
        entriesChunked.forEach(async(batch) => {
            await lfClient.batchGrantPermissions({Entries: batch}).promise()            
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