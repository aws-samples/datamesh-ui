# Data Mesh UI

## Setup

Once the repository has been cloned, the only requirement is to configure Cognito for the user login. If you're starting from scratch and you don't have an existing Cognito setup, please run the following:

```
amplify add auth
amplify push
```

If you have an existing Cognito setup that you wish to reuse. Run the following

```
amplify import auth
amplify push
```