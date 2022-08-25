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
import { GetDatabaseCommand, GlueClient } from "@aws-sdk/client-glue";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { Box, Button, Container, Form, FormField, Header, Input, Select, SpaceBetween, Table, Icon, Alert, ColumnLayout, BreadcrumbGroup } from "@cloudscape-design/components";
import {Amplify, Auth } from "aws-amplify";
import {useEffect, useState} from 'react';
import { useParams } from "react-router";
import {v4 as uuid} from 'uuid';
import ResourceLFTagsComponent from "./TBAC/ResourceLFTagsComponent";
import ValueWithLabel from "./ValueWithLabel";
const cfnOutput = require("../cfn-output.json");

const config = Amplify.configure();
const dpmStateMachineArn = cfnOutput.InfraStack.DPMStateMachineArn;

function RegisterNewProductComponent() {
    const {domainId} = useParams()
    const [error, setError] = useState();
    const [database, setDatabase] = useState(null)
    const [products, setProducts] = useState([{"id": uuid(), "name": "", "location": "", "firstRow": true}])
 
    // const onCancel = () => {
    //     window.location.href="/product-registration/list";
    // }

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
        if (database && isProductListValid()) {
            const credentials = await Auth.currentCredentials();
            const sfnClient = new SFNClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
            const formattedProducts = products.map((prod) => {
                prod.location = `${database.Database.LocationUri}/${prod.location}`
                prod.location_key = prod.location.substring(5);
                
                return prod;
            })
            await sfnClient.send(new StartExecutionCommand({
                stateMachineArn: dpmStateMachineArn,
                input: JSON.stringify({
                    "producer_acc_id": database.Database.Parameters.data_owner,
                    "database_name": domainId,
                    "tables": formattedProducts
                })
            }))

            window.location.href = `/tables/${domainId}`
        } else {
            setError("Missing required fields.");
        }
    }

    const isProductListValid = () => {
        for (const p of products) {
            if (!p.name || p.name.length == 0 || !p.location || p.location.length == 0 || p.location.startsWith("s3://")) {
                return false;
            }
        }

        return true;
    }

    const renderDatabaseDetails = () => {
        if (database) {
            return (
                <ColumnLayout columns={2} variant="text-grid">
                    <SpaceBetween size="m">
                        <ValueWithLabel label="Data Domain">
                            {database.Database.Name}
                        </ValueWithLabel>
                        <ValueWithLabel label="Location">
                            {database.Database.LocationUri}
                        </ValueWithLabel>
                    </SpaceBetween>
                    <SpaceBetween size="m">
                        <ValueWithLabel label="Data Owner">
                            {(database.Database.Parameters && "data_owner_name" in database.Database.Parameters) ? database.Database.Parameters.data_owner_name : "n/a"}
                        </ValueWithLabel>
                        <ValueWithLabel label="Data Owner Account ID">
                            {(database.Database.Parameters && "data_owner" in database.Database.Parameters) ? database.Database.Parameters.data_owner : "n/a"}   
                        </ValueWithLabel>
                        <ValueWithLabel label="Tags">
                            <ResourceLFTagsComponent resourceType="database" resourceName={database.Database.Name} />
                        </ValueWithLabel>
                    </SpaceBetween>
                </ColumnLayout>   
            )
        }

        return (
            <Alert header="Object Not Found" type="error">
                The requested Data Domain object can't be found. Please go back to the previous page.
            </Alert>
        )
    }

    useEffect(() => {
        (async function run() {
            
            const credentials = await Auth.currentCredentials()
            const glueClient = new GlueClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)})
            setDatabase(await glueClient.send(new GetDatabaseCommand({Name: domainId})))
        })()
    }, [])

    return (
        <Box>
            <BreadcrumbGroup items={[
                        { text: "Data Domains", href: "/"},
                        { text: domainId, href: `/tables/${domainId}`},
                        { text: "Register New Data Products" }
                    ]} />
            <Box margin={{top: "m"}}>
                <Form errorText={error} actions={
                    <SpaceBetween direction="horizontal" size="s">
                        <Button variant="link" href={`/tables/${domainId}`}>Cancel</Button>
                        <Button variant="primary" onClick={onSubmit} disabled={!database}>Submit</Button>
                    </SpaceBetween>
                }>
                    <Box margin={{top: "m"}}>
                        <Container header={<Header variant="h3">Register Data Products into Data Domain</Header>}>
                            {renderDatabaseDetails()}
                        </Container>
                    </Box>
                    <Box margin={{top: "m"}}>
                        <Table footer={<Button onClick={() => addProductRow()}><Icon name="add-plus" /> Add</Button>} header={<Header variant="h3">Products</Header>} columnDefinitions={[
                            {
                                header: "Name",
                                cell: e => <Input type="text" placeholder="Enter Name" value={e.name} onChange={(event) => updateField(e.id, "name", event.detail.value)} />
                            },
                            {
                                header: "S3 Location (Prefix)",
                                cell: e => <Input type="text" placeholder="Input prefix relative to Data Domain Location URI" value={e.location}  onChange={(event) => updateField(e.id, "location", event.detail.value)} />
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