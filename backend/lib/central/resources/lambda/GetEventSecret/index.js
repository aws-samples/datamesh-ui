const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

exports.handler = async(event) => {
    const smClient = new SecretsManagerClient()
    const resp = await smClient.send(new GetSecretValueCommand({
        SecretId: process.env.EVENT_SECRET_ARN
    }))

    return {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        },
        "body": resp.SecretString
    }
}