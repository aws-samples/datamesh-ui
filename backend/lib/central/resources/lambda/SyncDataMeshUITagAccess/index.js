const { LakeFormationClient, ListLFTagsCommand, BatchGrantPermissionsCommand } = require("@aws-sdk/client-lakeformation")

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
    const rolesToGrant = JSON.parse(process.env.ROLES_TO_GRANT);
    const lf = new LakeFormationClient()
    let NextToken = null
    let LFTags = null
    let tags = []

    do {
        ({LFTags, NextToken} = await lf.send(new ListLFTagsCommand({NextToken})))
        tags = tags.concat(LFTags)
    } while (NextToken);

    tags = sliceIntoChunks(tags, BATCH_GRANT_MAX_SIZE)

    rolesToGrant.forEach(async(roleArn) => {
        tags.forEach(async(batchedTags) => {
            const entries = []
    
            batchedTags.forEach((tag) => {
                entries.push({
                    Permissions: ["DESCRIBE"],
                    Principal: {
                        DataLakePrincipalIdentifier: roleArn
                    },
                    Resource: {
                        LFTag: {
                            TagKey: tag.TagKey,
                            TagValues: tag.TagValues
                        }
                    }
                })
            })
    
            await lf.send(new BatchGrantPermissionsCommand({Entries: entries}))
        })
    })

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        },
        "body": JSON.stringify({
            "result": `Synchronized ${tags.length} tags`
        })
    }
}