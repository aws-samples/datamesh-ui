const AWS = require("aws-sdk")

exports.handler = async({detail}) => {
    const payload = {
        dbName: {
            S: detail.dbName
        },
        tableName: {
            S: detail.tableName
        },
        state: {
            S: detail.state
        }
    }

    if (detail.error) {
        payload.error = {
            S: detail.error
        }
    }

    const ddbClient = new AWS.DynamoDB()
    const result = await ddbClient.putItem({
        TableName: process.env.DDB_TABLE_NAME,
        Item: payload
    }).promise()

    console.log(`Result: ${JSON.stringify(result)}`)
    return {}
}