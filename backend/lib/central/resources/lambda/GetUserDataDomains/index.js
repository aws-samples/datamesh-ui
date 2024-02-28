const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");

exports.handler = async(event) => {
    const userClaims = event.requestContext.authorizer.jwt.claims
    const ddbClient = new DynamoDBClient()

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    let nextToken = null
    const domainIds = []

    do {
        const resp = await ddbClient.send(new QueryCommand({
            TableName: process.env.USER_MAPPING_TABLE_NAME,
            ConsistentRead: false,
            ExclusiveStartKey: nextToken,
            KeyConditionExpression: "userId = :sub",
            ExpressionAttributeValues: {
                ":sub": {
                    "S": userClaims.sub
                }
            }
        })).promise()

        if (resp && resp.Items) {
            resp.Items.forEach((item) => {
                domainIds.push(item.accountId.S)
            })

            if (resp.LastEvaluatedKey) {
                nextToken = resp.LastEvaluatedKey
            }
        }
    } while(nextToken);

    payload.body = JSON.stringify({domainIds})

    return payload
}