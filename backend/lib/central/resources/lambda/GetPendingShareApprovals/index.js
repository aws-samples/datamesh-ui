const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const {DataDomain} = require("/opt/nodejs/data-domain")

exports.handler = async(event) => {
    const userId = DataDomain.extractUserId(event)
    const ddbClient = new DynamoDBClient()

    const domainIds = await DataDomain.getUserDataDomains(userId, process.env.USER_MAPPING_TABLE_NAME)

    let pendingApprovals = []

    for (const domainId of domainIds) {
        let nextToken = null
        do {
            const resp = await ddbClient.send(new QueryCommand({
                TableName: process.env.APPROVALS_TABLE_NAME,
                ConsistentRead: false,
                KeyConditionExpression: "accountId=:accountId and begins_with(requestIdentifier, :status)",
                ExpressionAttributeValues: {
                    ":accountId": {
                        "S": domainId
                    },
                    ":status": {
                        "S": "PENDING"
                    }
                },
                ExclusiveStartKey: nextToken
            }))
            nextToken = resp.LastEvaluatedKey
            pendingApprovals = pendingApprovals.concat(resp.Items)
        } while (nextToken)
    }

    return {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        },
        "body": JSON.stringify({
            "pendingApprovals": pendingApprovals
        })
    }
}