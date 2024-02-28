const { DynamoDBClient, GetItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");

const DataDomain = {
    extractUserId(event) {
        return event.requestContext.authorizer.jwt.claims.sub
    },
    async isOwner(userId, accountId, userMappingTableName) {
        const ddbClient = new DynamoDBClient()
        try {
            const result = await ddbClient.send(new GetItemCommand({
                TableName: userMappingTableName,
                Key: {
                    "userId": {
                        "S": userId
                    },
                    "accountId": {
                        "S": accountId
                    }
                },
                ConsistentRead: false
            }))
    
            if (result && result.Item) {
                return true
            } else {
                return false
            }
        } catch (e) {
            return false
        }
    },
    async getUserDataDomains(userId, userMappingTableName) {
        const ddbClient = new DynamoDBClient()
        let nextToken = null
        const domainIds = []

        do {
            const resp = await ddbClient.send(new QueryCommand({
                TableName: userMappingTableName,
                ConsistentRead: false,
                ExclusiveStartKey: nextToken,
                KeyConditionExpression: "userId = :sub",
                ExpressionAttributeValues: {
                    ":sub": {
                        "S": userId
                    }
                }
            }))
    
            if (resp && resp.Items) {
                resp.Items.forEach((item) => {
                    domainIds.push(item.accountId.S)
                })
    
                if (resp.LastEvaluatedKey) {
                    nextToken = resp.LastEvaluatedKey
                }
            }
        } while(nextToken);

        return domainIds
    }
}

exports.DataDomain = DataDomain