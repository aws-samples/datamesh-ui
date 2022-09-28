const AWS = require("aws-sdk")
const {DataDomain} = require("/opt/nodejs/data-domain")

exports.handler = async(event) => {
    const userId = DataDomain.extractUserId(event)
    const ddbClient = new AWS.DynamoDB()

    const domainIds = await DataDomain.getUserDataDomains(userId, process.env.USER_MAPPING_TABLE_NAME)

    const pendingApprovals = []

    for (const domainId of domainIds) {
        const nextToken = null
        do {
            const resp = await ddbClient.query({
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
            }).promise()
            nextToken = resp.LastEvaluatedKey
            pendingApprovals.concat(resp.Items)
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