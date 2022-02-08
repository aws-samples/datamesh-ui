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
import { AppLayout, Button, SideNavigation } from "@awsui/components-react";
import { BrowserRouter, Switch, Route } from "react-router-dom";
import CatalogComponent from "./CatalogComponent";
import CatalogTablesComponent from "./CatalogTablesComponent";
import {Auth} from "aws-amplify";
import WorkflowExecutionsComponent from "./WorkflowExecutionsComponent";
import WorkflowExecutionDetailsComponent from "./WorkflowExecutionDetailsComponent";
import TableDetailsComponent from "./TableDetailsComponent";

function MainComponent(props) {
    return (
        <AppLayout navigation={
            <SideNavigation 
                activeHref={window.location.pathname} 
                header={{ href: "/", text: "Data Lake Workflow"}}
                items={[
                    {type: "link", text: "Catalog", href: "/"},
                    {type: "link", text: "Workflow Executions", href: "/workflow-executions"},
                    {type: "link", text: "Logout", href: "#"}
                ]}
                onFollow={async(event) => {
                    event.preventDefault();
                    if (event.detail.text != "Logout") {
                        window.location = event.detail.href;
                    } else {
                        await Auth.signOut();
                        window.location = "/";
                    }
                }}
                />
        } content={
            <BrowserRouter>
                <Switch>
                    <Route exact path="/">
                        <CatalogComponent />
                    </Route>
                    <Route exact path="/tables/:dbname">
                        <CatalogTablesComponent />
                    </Route>
                    <Route exact path="/request-access/:dbname/:tablename">
                        <TableDetailsComponent />
                    </Route>
                    <Route exact path="/workflow-executions">
                        <WorkflowExecutionsComponent />
                    </Route>
                    <Route exact path="/execution-details/:execArn">
                        <WorkflowExecutionDetailsComponent />
                    </Route>
                </Switch>
            </BrowserRouter>
        } />
    );
}

export default MainComponent;