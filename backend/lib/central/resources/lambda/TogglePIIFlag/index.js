const {DataDomain} = require("/opt/nodejs/data-domain")
const { GlueClient, GetDatabaseCommand, UpdateDatabaseCommand, GetTableCommand, UpdateTableCommand } = require("@aws-sdk/client-glue")
const { LakeFormationClient, GrantPermissionsCommand, GetResourceLFTagsCommand, AddLFTagsToResourceCommand } = require("@aws-sdk/client-lakeformation")

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
        const glueClient = new GlueClient()
        const lfClient = new LakeFormationClient()
        let updateResp = null
        if (body.type == "database") {
            await lfClient.send(new GrantPermissionsCommand({
                Permissions: ["ALTER"],
                Principal: {
                    DataLakePrincipalIdentifier: process.env.LAMBDA_EXEC_ROLE_ARN
                },
                Resource: {
                    Database: {
                        Name: body.dbName
                    }
                }
            }))
            const {Database} = await glueClient.send(new GetDatabaseCommand({Name: body.dbName}))
            let piiFlag = "false"
            if (!Database.Parameters || !Database.Parameters.pii_flag || Database.Parameters.pii_flag === "false") {
                piiFlag = "true"
            }

            Database.Parameters.pii_flag = piiFlag
            updateResp = await glueClient.send(new UpdateDatabaseCommand({
                Name: body.dbName,
                DatabaseInput: {
                    Name: body.dbName,
                    LocationUri: Database.LocationUri,
                    Parameters: Database.Parameters,
                    Description: Database.Description
                }
            }))
            
        } else if (body.type == "column") {
            await lfClient.send(new GrantPermissionsCommand({
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
            }))
            const {Table} = await glueClient.send(new GetTableCommand({DatabaseName: body.dbName, Name: body.tableName}))

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

            updateResp = await glueClient.send(new UpdateTableCommand({
                DatabaseName: body.dbName,
                TableInput: Table
            }))
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
            
            const resourceLfTagsResponse = await lfClient.send(new GetResourceLFTagsCommand({Resource: resourceLfTagParams}))
            let tags = null

            if (resourceLfTagResponseName !== "LFTagsOnColumns") {
                tags = resourceLfTagsResponse[resourceLfTagResponseName]
            } else {
                tags = resourceLfTagsResponse[resourceLfTagResponseName][0].LFTags
            }
            

            const confidentialityTag = tags.find((tag) => tag.TagKey === process.env.CONFIDENTIALITY_KEY)

            if (confidentialityTag) {
                await lfClient.send(new GrantPermissionsCommand({
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
                }))

                const value = confidentialityTag.TagValues[0]
                let newValue = ""

                if (value === "sensitive") {
                    newValue = "non-sensitive"
                } else {
                    newValue = "sensitive"
                }

                updateResp = await lfClient.send(new AddLFTagsToResourceCommand({
                    LFTags: [
                        {
                            TagKey: process.env.CONFIDENTIALITY_KEY,
                            TagValues: [newValue]
                        }
                    ],
                    Resource: resourceLfTagParams
                }))
            }
        }

        payload.body = JSON.stringify(updateResp)
    } else {
        payload.statusCode = 404
        payload.body = JSON.stringify({"error": "Not found"})
    }

    return payload
}