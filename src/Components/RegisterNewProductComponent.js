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
import { Box, Button, Container, Form, FormField, Header, Input, Select, SpaceBetween, Table, Icon } from "@cloudscape-design/components";
import {Amplify, Auth } from "aws-amplify";
import {useState} from 'react';
import {v4 as uuid} from 'uuid';
const cfnOutput = require("../cfn-output.json");

const config = Amplify.configure();
const dpmStateMachineArn = cfnOutput.InfraStack.DPMStateMachineArn;

function RegisterNewProductComponent() {
    const [error, setError] = useState();

    const [products, setProducts] = useState([{"id": uuid(), "name": "", "location": "", "firstRow": true}])
    const [accountId, setAccountId] = useState(0);
    const [dbName, setDbName] = useState("");
    const [ownerName, setOwnerName] = useState("");
    const [piiFlag, setPiiFlag] = useState({label: "Contains PII Data", value: "true"});
 
    const onCancel = () => {
        window.location.href="/product-registration/list";
    }

    const addProductRow = () => {
        setProducts([...products, {"id": uuid(), "name": "", "location": "", "firstRow": false}])
    }

    const removeProductRow = (id) => {
        setProducts(products.filter(p => p.id != id))
    }

    const updateField = (id, fieldName, value) => {
        const index = products.findIndex(p => p.id == id);
        products[index][fieldName] = value;
        setProducts([...products]);
    }

    const onSubmit = async() => {
        if (accountId && dbName && ownerName && isProductListValid()) {
            const credentials = await Auth.currentCredentials();
            const sfnClient = new SFNClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
            const formattedProducts = products.map((prod) => {
                prod.location_key = prod.location.substring(5);

                return prod;
            })
            await sfnClient.send(new StartExecutionCommand({
                stateMachineArn: dpmStateMachineArn,
                input: JSON.stringify({
                    "data_product_s3": extractDatabaseS3Location(),
                    "database_name": dbName,
                    "producer_acc_id": accountId,
                    "product_owner_name": ownerName,
                    "product_pii_flag": piiFlag.value,
                    "tables": formattedProducts
                })
            }))

            window.location.href = "/product-registration/list"
        } else {
            setError("Missing required fields.");
        }
    }

    const isProductListValid = () => {
        for (const p of products) {
            if (!p.name || p.name.length == 0 || !p.location || p.location.length == 0 || !p.location.startsWith("s3://")) {
                return false;
            }
        }

        return true;
    }

    const extractDatabaseS3Location = () => {
        const row = products[0];
        const extractBucket = /s3:\/\/(.+?)\//;
        return extractBucket.exec(row.location)[1];
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
                    <Box margin={{top: "m"}}>
                        <Container header={<Header variant="h4" description="Metadata about the product.">Product Details</Header>}>
                            <FormField label="Product Account ID" constraintText="Must have the ProducerWorkflow IAM role already setup.">
                                <Input type="number" value={accountId} onChange={(event) => {setAccountId(event.detail.value)}} />
                            </FormField>
                            <FormField label="Database Name">
                                <Input type="text" value={dbName} onChange={(event) => {setDbName(event.detail.value)}} />
                            </FormField>
                            <FormField label="Owner Name">
                            <Input type="text" value={ownerName} onChange={(event) => {setOwnerName(event.detail.value)}} />
                            </FormField>
                            <FormField label="PII Data">
                                <Select selectedOption={piiFlag} options={[
                                                {label: "Contains PII Data", value: "true"},
                                                {label: "Does NOT Contain PII Data", value: "false"}
                                            ]} onChange={(event) => {setPiiFlag(event.detail.selectedOption)}} />
                            </FormField>
                        </Container>
                    </Box>
                    <Box margin={{top: "m"}}>
                        <Table footer={<Button onClick={() => addProductRow()}><Icon name="add-plus" /> Add</Button>} header={<Header variant="h3">Products</Header>} columnDefinitions={[
                            {
                                header: "Name",
                                cell: e => <Input type="text" placeholder="Enter Name" value={e.name} onChange={(event) => updateField(e.id, "name", event.detail.value)} />
                            },
                            {
                                header: "S3 Location",
                                cell: e => <Input type="text" placeholder="Input the full path, example: s3://example-bucket/prefix/product-name/" value={e.location}  onChange={(event) => updateField(e.id, "location", event.detail.value)} />
                            },
                            {
                                header: "",
                                cell: e => (!e.firstRow) ? <Button onClick={() => removeProductRow(e.id)}><Icon name="close" /> Remove</Button>: null
                            }
                        ]} items={products}></Table>
                    </Box>
                </Form>
            </Box>
        </Box>
    );
}

export default RegisterNewProductComponent;