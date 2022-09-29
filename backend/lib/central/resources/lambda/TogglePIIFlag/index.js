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
        } else if (body.type == "tags") {
            let resourceLfTagParams = null
            let resourceLfTagResponseName = null
            switch (body.resourceType) {
                case "database":
                    resourceLfTagParams = {
                        "Database": {
                            "Name": body.dbName
                        }
                    }
                    resourceLfTagResponseName = "LFTagOnDatabase"
                    break;
                case "table":
                    resourceLfTagParams = {
                        "Table": {
                            "DatabaseName": body.dbName,
                            "Name": body.tableName
                        }
                    }
                    resourceLfTagResponseName = "LFTagsOnTable"
                    break;
                case "column":
                    resourceLfTagParams = {
                        "TableWithColumns": {
                            "DatabaseName": body.dbName,
                            "Name": body.tableName,
                            "ColumnNames": [body.columnName]
                        }
                    }
                    resourceLfTagResponseName = "LFTagsOnColumns"
                    break;
                
            }
            
            const resourceLfTagsResponse = await lfClient.getResourceLFTags({Resource: resourceLfTagParams}).promise()
            let tags = null

            if (resourceLfTagResponseName !== "LFTagsOnColumns") {
                tags = resourceLfTagsResponse[resourceLfTagResponseName]
            } else {
                tags = resourceLfTagsResponse[resourceLfTagResponseName][0].LFTags
            }
            

            const confidentialityTag = tags.find((tag) => tag.TagKey === process.env.CONFIDENTIALITY_KEY)

            if (confidentialityTag) {
                await lfClient.grantPermissions({
                    Permissions: ["ASSOCIATE"],
                    Principal: {
                        DataLakePrincipalIdentifier: process.env.LAMBDA_EXEC_ROLE_ARN
                    },
                    Resource: {
                        LFTag: {
                            TagKey: process.env.CONFIDENTIALITY_KEY,
                            TagValues: ["sensitive", "non-sensitive"]
                        }
                    }
                }).promise()

                const value = confidentialityTag.TagValues[0]
                let newValue = ""

                if (value === "sensitive") {
                    newValue = "non-sensitive"
                } else {
                    newValue = "sensitive"
                }

                updateResp = await lfClient.addLFTagsToResource({
                    LFTags: [
                        {
                            TagKey: process.env.CONFIDENTIALITY_KEY,
                            TagValues: [newValue]
                        }
                    ],
                    Resource: resourceLfTagParams
                }).promise()
            }
        }

        payload.body = JSON.stringify(updateResp)
    } else {
        payload.statusCode = 404
        payload.body = JSON.stringify({"error": "Not found"})
    }

    return payload
}