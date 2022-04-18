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
import logo from './logo.svg';
import './App.css';
import awsconfig from './aws-exports';
import {AmplifySignIn, AmplifyAuthenticator} from '@aws-amplify/ui-react'
import Amplify from 'aws-amplify';
import MainComponent from './Components/MainComponent';
import { useEffect, useState } from 'react';
import {AuthState, onAuthUIStateChange} from '@aws-amplify/ui-components';
const cfnOutput = require("./cfn-output.json");

Amplify.configure(awsconfig);

Amplify.configure({
    API: {
        endpoints: [
            {
                name: "DataQualityAPIGW",
                endpoint: cfnOutput.InfraStack.DataQualityHttpApiUrl
            }
        ]
    }
});

function App() {

  const [authState, setAuthState] = useState();
  const [user, setUser] = useState();

  useEffect(() => {
    return onAuthUIStateChange((nextAuthState, authData) => {
      setAuthState(nextAuthState);
      setUser(authData);
    })
  }, []);

  const component = (authState === AuthState.SignedIn && user ? <MainComponent /> : <AmplifyAuthenticator><AmplifySignIn slot="sign-in" hideSignUp></AmplifySignIn></AmplifyAuthenticator>);

  return component;
}

export default App;
