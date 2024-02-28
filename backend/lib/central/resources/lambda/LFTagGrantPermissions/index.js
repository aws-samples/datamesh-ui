const { LakeFormationClient, GrantPermissionsCommand } = require("@aws-sdk/client-lakeformation");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const {Approvals} = require("/opt/nodejs/approvals")

exports.handler = async(event) => {
    const lf = new LakeFormationClient()

    for (const row of event.lfTags) {
        await lf.send(new GrantPermissionsCommand({
            "Permissions": ["DESCRIBE"],
            "Principal": {
                "DataLakePrincipalIdentifier": event.targetAccountId
            },
            "Resource": {
                "LFTag": row
            },
            "PermissionsWithGrantOption": ["DESCRIBE"]
        }))
    }

    await lf.send(new GrantPermissionsCommand({
        "Permissions": ["DESCRIBE"],
        "Principal": {
            "DataLakePrincipalIdentifier": event.targetAccountId
        },
        "Resource": {
            "LFTagPolicy": {
                "ResourceType": "DATABASE",
                "Expression": event.lfTags
            }
        },
        "PermissionsWithGrantOption": ["DESCRIBE"]
    }))

    await lf.send(new GrantPermissionsCommand({
        "Permissions": ["SELECT", "DESCRIBE"],
        "Principal": {
            "DataLakePrincipalIdentifier": event.targetAccountId
        },
        "Resource": {
            "LFTagPolicy": {
                "ResourceType": "TABLE",
                "Expression": event.lfTags
            }
        },
        "PermissionsWithGrantOption": ["SELECT", "DESCRIBE"]
    }))

    const ddb = new DynamoDBClient()
    const tableName = process.env.PRODUCT_SHARING_MAPPING_TABLE_NAME

    await ddb.send(new PutItemCommand({
        TableName: tableName,
        Item: {
            "domainId": {
                "S": event.databaseName
            },
            "resourceMapping": {
                "S": Approvals.generateLfTagRequestIdentifier(event.lfTags, event.targetAccountId)
            },
            "status": {
                "S": "shared"
            }
        }
    }))
}