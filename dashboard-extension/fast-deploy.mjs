#!/usr/bin/env node

/**
 * Fast Deploy Script for IBM Concert Operate / Cloud Pak for AIOps Custom Dashboards
 * Automatically builds bundle, uploads to MinIO, patches OpenShift CR, and updates ConfigMap.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { AiopsBundleApiClient, UploadBundleTask, loginWithApiKey } from 'cp4waiops-ui-bundle-tools';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.removeAllListeners('warning');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const targetData = JSON.parse(fs.readFileSync(path.join(__dirname, 'target.json'), 'utf8'));
const routesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/routes.json'), 'utf8'));

// Custom HTTPS request with fast socket termination
function fastHttpsRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ keepAlive: false, rejectUnauthorized: false });
    const req = https.request(url, { ...options, agent, rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        agent.destroy();
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', (err) => {
      agent.destroy();
      reject(err);
    });
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  const startTime = Date.now();
  console.log('\n🚀 Starting Fast Deployment to Concert Operate & OpenShift...');

  // 1. Upload Bundle to Concert Operate (MinIO)
  console.log('📡 1/3 Logging in and uploading bundle to Concert Operate...');
  try {
    const { authToken } = await loginWithApiKey(targetData.url, targetData.username, targetData.apiKey);
    const bundleClient = AiopsBundleApiClient({ url: targetData.url, token: authToken });
    const uploadTask = UploadBundleTask(bundleClient);
    await uploadTask.uploadBundleFromDirectory(targetData.tenantId, targetData.bundleName, path.join(__dirname, 'dist'));
    console.log('   ✅ Bundle uploaded successfully to MinIO!');
  } catch (err) {
    console.error('   ❌ Bundle upload failed:', err.message || err);
    process.exit(1);
  }

  // 2. OpenShift OAuth Login
  console.log('🔑 2/3 Authenticating with OpenShift API...');
  let osToken;
  try {
    // Credentials come from the environment, never from this file:
    //   export OPENSHIFT_USER=kubeadmin   (optional, defaults to kubeadmin)
    //   export OPENSHIFT_PASSWORD='...'
    const osUser = process.env.OPENSHIFT_USER || 'kubeadmin';
    const osPassword = process.env.OPENSHIFT_PASSWORD;
    if (!osPassword) throw new Error('Set the OPENSHIFT_PASSWORD environment variable (and optionally OPENSHIFT_USER) before running fast-deploy.');
    const authHeader = 'Basic ' + Buffer.from(`${osUser}:${osPassword}`).toString('base64');
    const authRes = await fastHttpsRequest(
      'https://oauth-openshift.apps.aiops-4.cp.fyre.ibm.com/oauth/authorize?response_type=token&client_id=openshift-challenging-client',
      {
        method: 'GET',
        headers: { 'Authorization': authHeader, 'X-CSRF-Token': '1' }
      }
    );
    const match = authRes.headers.location?.match(/access_token=([^&]+)/);
    if (!match) throw new Error('Failed to retrieve OAuth token from OpenShift response header');
    osToken = match[1];
    console.log('   ✅ OpenShift OAuth token obtained!');
  } catch (err) {
    console.error('   ❌ OpenShift authentication failed:', err.message || err);
    process.exit(1);
  }

  // 3. Patch Custom Resource and ConfigMap in Parallel
  console.log('🗺️  3/3 Updating OpenShift AIOpsUIExtension CR & ConfigMap...');
  try {
    const crPromise = fastHttpsRequest(
      'https://api.aiops-4.cp.fyre.ibm.com:6443/apis/consoleui.aiops.ibm.com/v1/namespaces/aiops/aiopsuiextensions/aiopsuiextension-sample',
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${osToken}`,
          'Content-Type': 'application/merge-patch+json',
          'Accept': 'application/json'
        }
      },
      JSON.stringify({ spec: routesData.spec })
    );

    const cmPromise = fastHttpsRequest(
      'https://api.aiops-4.cp.fyre.ibm.com:6443/api/v1/namespaces/aiops/configmaps/aiops-ir-ui-extensions',
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${osToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      },
      JSON.stringify({
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'aiops-ir-ui-extensions', namespace: 'aiops' },
        data: { 'alerts-examples.json': JSON.stringify(routesData.spec) }
      })
    );

    const [crRes, cmRes] = await Promise.all([crPromise, cmPromise]);
    console.log(`   ✅ CR Patch Status: HTTP ${crRes.statusCode}`);
    console.log(`   ✅ ConfigMap Update Status: HTTP ${cmRes.statusCode}`);
  } catch (err) {
    console.error('   ❌ Failed updating cluster resources:', err.message || err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Deployment Complete in ${elapsed}s! Hard refresh browser (Cmd+Shift+R) to view.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
