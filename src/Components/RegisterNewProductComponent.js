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
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { Box, Button, Container, Form, FormField, Header, Input, Select, SpaceBetween } from "@awsui/components-react";
import Amplify, { Auth } from "aws-amplify";
import {useState} from 'react';
const cfnOutput = require("../cfn-output.json");

const config = Amplify.configure();
const dpmStateMachineArn = cfnOutput.InfraStack.DPMStateMachineArn;

function RegisterNewProductComponent() {
    const [error, setError] = useState();

    const [accountId, setAccountId] = useState(0);
    const [bucket, setBucket] = useState("");
    const [prefix, setPrefix] = useState("");
    const [dbName, setDbName] = useState("");
    const [productName, setProductName] = useState("");
    const [ownerName, setOwnerName] = useState("");
    const [piiFlag, setPiiFlag] = useState({label: "Contains PII Data", value: "true"});
 
    const onCancel = () => {
        window.location.href="/product-registration/list";
    }

    const onSubmit = async() => {
        if (accountId && bucket && prefix && dbName && productName && ownerName) {
            const credentials = await Auth.currentCredentials();
            const sfnClient = new SFNClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
            await sfnClient.send(new StartExecutionCommand({
                stateMachineArn: dpmStateMachineArn,
                input: JSON.stringify({
                    "productAccountId": accountId,
                    "productBucketName": bucket,
                    "productLocationPrefix": prefix,
                    "productDatabaseName": dbName,
                    "productName": productName,
                    "productOwnerName": ownerName,
                    "productPiiFlag": piiFlag.value
                })
            }))

            window.location.href = "/product-registration/list"
        } else {
            setError("Missing required fields.");
        }
    }

    return (
        <Box>
            <Header variant="h1">Register New Product</Header>
            <Box margin={{top: "m"}}>
                <Form errorText={error} actions={
                    <SpaceBetween direction="horizontal" size="s">
                        <Button variant="link" onClick={onCancel}>Cancel</Button>
                        <Button variant="primary" onClick={onSubmit}>Submit</Button>
                    </SpaceBetween>
                }>
                    <Container>
                        <FormField label="Product Account ID" description="Account ID where the product is located.">
                            <Input type="number" value={accountId} onChange={(event) => {setAccountId(event.detail.value)}} />
                        </FormField>
                        <FormField label="Data Location" description="S3 location where the product is stored.">
                            <SpaceBetween direction="horizontal" size="m">
                                <Input type="text" placeholder="S3 Bucket Name" value={bucket} onChange={(event) => {setBucket(event.detail.value)}} />
                                <Input type="text" placeholder="Prefix ending with /" value={prefix} onChange={(event) => {setPrefix(event.detail.value)}} />
                            </SpaceBetween>
                        </FormField>
                        <FormField label="Product Metadata" description="Details about the product.">
                            <SpaceBetween direction="horizontal" size="m">
                                <Input type="text" placeholder="Database Name" value={dbName} onChange={(event) => {setDbName(event.detail.value)}} />
                                <Input type="text" placeholder="Product Name" value={productName} onChange={(event) => {setProductName(event.detail.value)}} />
                                <Input type="text" placeholder="Owner Name" value={ownerName} onChange={(event) => {setOwnerName(event.detail.value)}} />
                            </SpaceBetween>
                        </FormField>
                        <FormField label="PII Data" description="Does the product contain sensitive information?">
                            <Select selectedOption={piiFlag} options={[
                                        {label: "Contains PII Data", value: "true"},
                                        {label: "Does NOT Contain PII Data", value: "false"}
                                    ]} onChange={(event) => {setPiiFlag(event.detail.selectedOption)}} />
                        </FormField>
                    </Container>
                </Form>
            </Box>
        </Box>
    );
}

export default RegisterNewProductComponent;