const AWS = require("aws-sdk");

exports.handler = async(event) => {
    const rolesToGrant = JSON.parse(process.env.ROLES_TO_GRANT);
    const lf = new AWS.LakeFormation();
    let NextToken = null
    let LFTags = null
    let tags = []

    do {
        ({LFTags, NextToken} = await lf.listLFTags({NextToken}).promise())
        tags = tags.concat(LFTags)
    } while (NextToken);

    for (let t of tags) {
        try {
            if (event.RequestType == "Create" || event.RequestType == "Update") {
                for (let roleArn of rolesToGrant) {
                    await lf.grantPermissions({
                        Permissions: ["DESCRIBE"],
                        Principal: {
                            DataLakePrincipalIdentifier: roleArn
                        },
                        Resource: {
                            LFTag: {
                                TagKey: t.TagKey,
                                TagValues: t.TagValues
                            }
                        }
                    }).promise();
                }
            } else if (event.RequestType == "Delete") {
                for (let roleArn of rolesToGrant) {
                    await lf.revokePermissions({
                        Permissions: ["DESCRIBE"],
                        Principal: {
                            DataLakePrincipalIdentifier: roleArn
                        },
                        Resource: {
                            LFTag: {
                                TagKey: t.TagKey,
                                TagValues: t.TagValues
                            }
                        }
                    }).promise();
                }
            }
        } catch (e) {
            //suppress in case tag doesn't exists.
        }
    }
}