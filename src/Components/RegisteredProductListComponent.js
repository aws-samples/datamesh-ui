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

import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { Header, Table } from "@awsui/components-react";
import {Amplify, Auth } from "aws-amplify";
import { useEffect, useState } from "react";
const cfnOutput = require("../cfn-output.json")

const config = Amplify.configure();
const tableParam = cfnOutput.InfraStack.RegisterProductTable;

function RegisteredListComponent(props) {
    const status = props.status;
    const [products, setProducts] = useState([]);
    const title = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
        
    useEffect(async() => {
        const credentials = await Auth.currentCredentials();
        const client = new DynamoDBClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
        const commandResponse = await client.send(new QueryCommand({
            IndexName: tableParam["GSI-StatusIndex"],
            TableName: tableParam["Name"],
            KeyConditionExpression: "#status = :status",
            ExpressionAttributeNames: {
                "#status": "status"
            },
            ExpressionAttributeValues: {
                ":status": {"S": status}
            }
        }));

        const tempProducts = [];
        for (const item of commandResponse.Items) {
            const [dbName, tableName] = item.dbTableName.S.split("#");
            tempProducts.push({
                accountId: item.accountId.S,
                dbName: dbName,
                tableName: tableName,
                status: item.status.S,
                createdAt: item.createdAt.N
            })
        }

        setProducts(tempProducts);
    });

    return (
        <Table items={products} columnDefinitions={[
            {
                header: "Account ID",
                cell: item => item.accountId
            },
            {
                header: "Database Name",
                cell: item => item.dbName
            },
            {
                header: "Product Name",
                cell: item => item.tableName
            }
        ]} header={<Header variant="h2">{title}</Header>}></Table>
    );
}

export default RegisteredListComponent;