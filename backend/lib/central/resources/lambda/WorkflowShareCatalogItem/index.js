/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
const AWS = require("aws-sdk");
const util = require("util");

exports.handler = async (event) => {
    const target = event.target;
    const source = event.source;
    
    const lakeformation = new AWS.LakeFormation();
    
    const grantParams = {
        Permissions: ["SELECT", "DESCRIBE"],
        PermissionsWithGrantOption: ["SELECT", "DESCRIBE"],
        Principal: {
            DataLakePrincipalIdentifier: target.account_id
        }
    }

    if (source.table == "*") {
        grantParams["Resource"] = {
            Table: {
                DatabaseName: source.database,
                TableWildcard: {}
            }
        }
    } else {
        grantParams["Resource"] = {
            Table: {
                DatabaseName: source.database,
                Name: source.table
            }
        }

        const ddb = new AWS.DynamoDB()
        const tableName = process.env.MAPPING_TABLE_NAME

        await ddb.putItem({
            TableName: tableName,
            Item: {
                "domainId": {
                    "S": source.database
                },
                "resourceMapping": {
                    "S": `${source.table}#${target.account_id}`
                }
            }
        }).promise()

    }
    
    return await lakeformation.grantPermissions(grantParams).promise();
};
