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
const { GlueClient, GetDatabaseCommand, GetTableCommand } = require("@aws-sdk/client-glue");
const PII_PROPERTY_KEY = "pii_flag";
const DATA_OWNER_KEY = "data_owner";

exports.handler = async (event) => {
    const dbName = event.database;
    const tableName = event.table;
    
    const glue = new GlueClient()
    var hasPii = false;
    var dataOwner = null;
    var db = null;
    
    const dbDetails = await glue.send(new GetDatabaseCommand({Name: dbName}))
    if (dbDetails.Database) {
        db = dbDetails.Database;
        if (db.Parameters && DATA_OWNER_KEY in db.Parameters) {
            dataOwner = db.Parameters[DATA_OWNER_KEY];
        } else {
            throw new Error("Missing data_owner parameter in database");
        }
    } else {
        throw new Error("Invalid request, missing database.");
    }    
    
    if (tableName == "*") {
        if (db.Parameters && PII_PROPERTY_KEY in db.Parameters) {
            hasPii = db.Parameters[PII_PROPERTY_KEY] === "true";
        }
    } else {
        const details = await glue.send(new GetTableCommand({
            DatabaseName: dbName,
            Name: tableName
        }))
    
        const columns = details.Table.StorageDescriptor.Columns;

        for (var i = 0; i < columns.length; i++) {
            const col = columns[i];
            
            if ("Parameters" in col) {
                if (PII_PROPERTY_KEY in col.Parameters) {
                    hasPii = col.Parameters[PII_PROPERTY_KEY] === "true";
                    
                    if (hasPii)
                        break;
                }
            }
        }   
    }

    var response = {
        has_pii: hasPii,
        data_owner: dataOwner
    }

    return response;
};
