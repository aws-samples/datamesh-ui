const { LakeFormation } = require("aws-sdk");
const AWS = require("aws-sdk");
const {Approvals} = require("/opt/nodejs/approvals")

exports.handler = async(event) => {
    const lf = new LakeFormation();

    for (const row of event.lfTags) {
        await lf.grantPermissions({
            "Permissions": ["DESCRIBE"],
            "Principal": {
                "DataLakePrincipalIdentifier": event.targetAccountId
            },
            "Resource": {
                "LFTag": row
            },
            "PermissionsWithGrantOption": ["DESCRIBE"]
        }).promise();
    }

    await lf.grantPermissions({
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
    }).promise();

    await lf.grantPermissions({
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
    }).promise();

    const ddb = new AWS.DynamoDB()
    const tableName = process.env.PRODUCT_SHARING_MAPPING_TABLE_NAME

    await ddb.putItem({
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
    }).promise()
}