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

import { Box, Button, Header, Icon, SpaceBetween } from "@cloudscape-design/components";
import RegisteredListComponent from "./RegisteredProductListComponent";
import {useState} from "react";

function ProductRegistrationListComponent() {

    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // const doRefresh = async(event) => {
    //     setRefreshTrigger(refreshTrigger + 1);
    // }

    const doRegisterNew = () => {
        window.location.href="/product-registration/new"
    }

    return (
        <Box>
            <Header variant="h1">Product Registration</Header>
            <Box>
                <SpaceBetween direction="horizontal" size="s">
                    <Button onClick={doRegisterNew} variant="primary"><Icon name="add-plus" /> Register Product</Button>
                </SpaceBetween>
            </Box>
            <Box margin={{top: "m"}}>
                <RegisteredListComponent status="RUNNING" refreshTrigger={refreshTrigger} />
            </Box>
            <Box margin={{top: "m"}}>
                <RegisteredListComponent status="SUCCEEDED" refreshTrigger={refreshTrigger} />
            </Box>
            <Box margin={{top: "m"}}>
                <RegisteredListComponent status="FAILED" refreshTrigger={refreshTrigger} />
            </Box>
        </Box>
    )
}

export default ProductRegistrationListComponent;