# OpenAI Realtime Console

This is a fork of the example application showing how to use the [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) with [WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc). This version uses Express JS with Vite instead of Fastify, as Fastify was not working correctly with Windows paths. Here is the official version [https://github.com/openai/openai-realtime-console](https://github.com/openai/openai-realtime-console).

I put this together for those who want to test locally and cannot get the Fastify instance working correctly. I spent far too much time debugging the fastify path issues LOL... updating to use Express was much easier!!

## Installation and usage

Before you begin, you'll need an OpenAI API key - [create one in the dashboard here](https://platform.openai.com/settings/api-keys). 

Create a `.env` file in the root directory of the project and add your API key:

```
OPENAI_API_KEY=<your key here>
```

Running this application locally requires [Node.js](https://nodejs.org/) to be installed. Install dependencies for the application with:

```bash
npm install
```

Start the application server with:

```bash
npm run dev
```

This should start the console application on [http://localhost:3000](http://localhost:3000).


## Local Testing Only

Please note that this version of the application is intended for local testing purposes only. No build procedures have been set up for deployment.