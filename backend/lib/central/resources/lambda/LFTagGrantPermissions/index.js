const { LakeFormation } = require("aws-sdk");
const AWS = require("aws-sdk");

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
}