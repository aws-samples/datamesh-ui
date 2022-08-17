const AWS = require("aws-sdk");

exports.handler = async(event) => {
    const rolesToGrant = JSON.parse(process.env.ROLES_TO_GRANT);
    const tags = JSON.parse(process.env.LF_TAGS);

    const lf = new AWS.LakeFormation();

    for (let t of tags) {
        try {
            const tagDetails = await lf.getLFTag({TagKey: t}).promise();

            if (event.RequestType == "Create" || event.RequestType == "Update") {
                for (let roleArn of rolesToGrant) {
                    await lf.grantPermissions({
                        Permissions: ["DESCRIBE"],
                        Principal: {
                            DataLakePrincipalIdentifier: roleArn
                        },
                        Resource: {
                            LFTag: {
                                TagKey: t,
                                TagValues: tagDetails.TagValues
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
                                TagKey: t,
                                TagValues: tagDetails.TagValues
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