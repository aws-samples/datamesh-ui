const AWS = require("aws-sdk");

exports.handler = async(event) => {
    const rolesToGrant = JSON.parse(process.env.ROLES_TO_GRANT);
    const tags = JSON.parse(process.env.LF_TAGS);

    const lf = new AWS.LakeFormation();

    for (let t of tags) {
        try {
            const tagDetails = await lf.getLFTag({TagKey: t}).promise();
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
        } catch (e) {
            //suppress in case tag doesn't exists.
        }
    }

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