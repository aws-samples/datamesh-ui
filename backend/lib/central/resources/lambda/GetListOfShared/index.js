const AWS = require("aws-sdk")

exports.handler = async(event) => {
    const userClaims = event.requestContext.authorizer.jwt.claims
    const ddbClient = new AWS.DynamoDB()
    const userId = userClaims.sub

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    const {queryStringParameters} = event

    if (queryStringParameters.domainId && queryStringParameters.product) {
        const {domainId, product} = queryStringParameters
        let token = null
        let userAccountIds = []
        
        do {
            const userMappingResults = await ddbClient.query({
                TableName: process.env.USER_MAPPING_TABLE_NAME,
                KeyConditionExpression: "userId = :userId",
                ExpressionAttributeValues: {
                    ":userId": {
                        "S": userId
                    }
                },
                ConsistentRead: false,
                ExclusiveStartKey: token
            }).promise()

            token = userMappingResults.LastEvaluatedKey
            if (userMappingResults.Items) {
                userAccountIds = userAccountIds.concat(userMappingResults.Items.map((row) => {
                    return row.accountId.S
                }))
            }
            
        } while(token)


        if (userAccountIds) {
            const getItemPromises = userAccountIds.map((userAccountId) => {
                return ddbClient.getItem({
                    TableName: process.env.MAPPING_TABLE_NAME,
                    ConsistentRead: true,
                    Key: {
                        "domainId": {
                            "S": domainId
                        },
                        "resourceMapping": {
                            "S": `${product}#${userAccountId}`
                        }
                    }
                }).promise()
            })

            const getItemPromisesResult = await Promise.all(getItemPromises)

            const existMap = userAccountIds.map((userAccountId, idx) => {
                const promiseResult = getItemPromisesResult[idx]

                return {
                    accountId: userAccountId,
                    status: (promiseResult && promiseResult.Item) ? promiseResult.Item.status.S : null
                }
            })

            payload.body = JSON.stringify({"sharedAccountIds": existMap})
        } else {
            payload.statusCode = "404",
            payload.body = JSON.stringify({"error": "Not found"})            
        }
    } else {
        payload.statusCode = "404",
        payload.body = JSON.stringify({"error": "Not found"})
    }

    return payload
}