const AWS = require("aws-sdk")

exports.handler = async(event) => {
    const {queryStringParameters} = event

    let dbName = null;
    let tableName = null;

    if (queryStringParameters.dbName) {
        dbName = queryStringParameters.dbName
    }

    if (queryStringParameters.tableName) {
        tableName = queryStringParameters.tableName
    }

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    if (dbName && tableName) {
        const ddbClient = new AWS.DynamoDB()

        try {
            const result = await ddbClient.getItem({
                TableName: process.env.DDB_TABLE_NAME,
                Key: {
                    "dbName": {
                        "S": dbName
                    },
                    "tableName": {
                        "S": tableName
                    }
                },
                ConsistentRead: false
            }).promise()
    
            const {Item} = result

            payload.body = JSON.stringify({
                dbName: Item.dbName.S,
                tableName: Item.tableName.S,
                state: Item.state.S,
                error: (Item.error) ? Item.error.S : null
            })
        } catch (e) {
            if (e instanceof ResourceNotFoundException) {
                payload.statusCode = 404
                payload.body = JSON.stringify({
                    "error": "Resource not found"
                })
            }
        }

        return payload
    }

    payload.statusCode = "400"
    payload.body = JSON.stringify({
        "error": "Missing required parameters"
    })

    return payload

}