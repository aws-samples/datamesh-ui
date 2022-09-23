const AWS = require("aws-sdk")

exports.handler = async(event) => {
    const smClient = new AWS.SecretsManager()
    const resp = await smClient.getSecretValue({
        SecretId: process.env.EVENT_SECRET_ARN
    }).promise()

    return {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        },
        "body": resp.SecretString
    }
}