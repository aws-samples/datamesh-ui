const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

exports.handler = async(event) => {
    const ddbClient = new DynamoDBClient()
    const userClaim = event.requestContext.authorizer.jwt.claims

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    const accountId = event.queryStringParameters.accountId

    if (!accountId) {
        payload.statusCode = 400
        payload.body = JSON.stringify({"error": "Missing required parameters"})
    } else {
        try {
            const result = await ddbClient.send(new GetItemCommand({
                TableName: process.env.USER_MAPPING_TABLE_NAME,
                Key: {
                    "userId": {
                        "S": userClaim.sub
                    },
                    "accountId": {
                        "S": accountId
                    }
                },
                ConsistentRead: false
            }))

            if (result && result.Item) {
                payload.body = JSON.stringify({"message": "ok"})
            } else {
                throw new Error("Not found")
            }
        } catch (e) {
            payload.statusCode = 404
            payload.body = JSON.stringify({"error": "Not found"})
        }
    }

    return payload
}