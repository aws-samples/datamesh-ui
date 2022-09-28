const {DataDomain} = require("/opt/nodejs/data-domain")
const AWS = require("aws-sdk")

exports.handler = async(event) => {
    const userId = DataDomain.extractUserId(event)
    const body = JSON.parse(event.body)
    const accountId = body.domainId

    const isOwner = DataDomain.isOwner(userId, accountId, process.env.USER_MAPPING_TABLE_NAME)

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    if (isOwner) {
        const glueClient = new AWS.Glue()
        const lfClient = new AWS.LakeFormation()
        let updateResp = null
        if (body.type == "database") {
            await lfClient.grantPermissions({
                Permissions: ["ALTER"],
                Principal: {
                    DataLakePrincipalIdentifier: process.env.LAMBDA_EXEC_ROLE_ARN
                },
                Resource: {
                    Database: {
                        Name: body.dbName
                    }
                }
            }).promise()
            const {Database} = await glueClient.getDatabase({Name: body.dbName}).promise()
            let piiFlag = "false"
            if (!Database.Parameters || !Database.Parameters.pii_flag || Database.Parameters.pii_flag === "false") {
                piiFlag = "true"
            }

            Database.Parameters.pii_flag = piiFlag
            updateResp = await glueClient.updateDatabase({
                Name: body.dbName,
                DatabaseInput: {
                    Name: body.dbName,
                    LocationUri: Database.LocationUri,
                    Parameters: Database.Parameters,
                    Description: Database.Description
                }
            }).promise()
            
        } else if (body.type == "column") {
            await lfClient.grantPermissions({
                Permissions: ["ALTER"],
                Principal: {
                    DataLakePrincipalIdentifier: process.env.LAMBDA_EXEC_ROLE_ARN
                },
                Resource: {
                    Table: {
                        DatabaseName: body.dbName,
                        Name: body.tableName
                    }
                }
            }).promise()
            const {Table} = await glueClient.getTable({DatabaseName: body.dbName, Name: body.tableName}).promise()

            Table.StorageDescriptor.Columns = Table.StorageDescriptor.Columns.map((column) => {
                if (column.Name === body.columnName) {
                    let piiFlag = "false"

                    if (!column.Parameters || !column.Parameters.pii_flag || column.Parameters.pii_flag === "false") {
                        piiFlag = "true"
                    }

                    if (!column.Parameters) {
                        column.Parameters = {}
                    }

                    column.Parameters.pii_flag = piiFlag
                }

                return column
            })

            delete Table.CreatedBy
            delete Table.CreateTime
            delete Table.CatalogId
            delete Table.IsRegisteredWithLakeFormation
            delete Table.DatabaseName
            delete Table.UpdateTime
            delete Table.VersionId

            updateResp = await glueClient.updateTable({
                DatabaseName: body.dbName,
                TableInput: Table
            }).promise()
        }

        payload.body = JSON.stringify(updateResp)
    } else {
        payload.statusCode = 404
        payload.body = JSON.stringify({"error": "Not found"})
    }

    return payload
}