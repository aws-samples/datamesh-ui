const { LakeFormationClient, GrantPermissionsCommand, RevokePermissionsCommand, ListLFTagsCommand } = require("@aws-sdk/client-lakeformation");

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

    for (let t of tags) {
        try {
            if (event.RequestType == "Create" || event.RequestType == "Update") {
                for (let roleArn of rolesToGrant) {
                    await lf.send(new GrantPermissionsCommand({
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
                    }))
                }
            } else if (event.RequestType == "Delete") {
                for (let roleArn of rolesToGrant) {
                    await lf.send(new RevokePermissionsCommand({
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
                    }))
                }
            }
        } catch (e) {
            //suppress in case tag doesn't exists.
        }
    }
}