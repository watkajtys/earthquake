export function releaseIdentity(env) {
  const required = ['ASSETS', 'DB', 'CLUSTER_KV', 'USGS_LAST_RESPONSE_KV', 'GEOJSON_BUCKET', 'GEOJSON_QUEUE'];
  if (env.DEPLOYMENT_ENVIRONMENT === 'production') required.push('STATIC_KV');
  const ok = required.every((binding) => Boolean(env[binding])) &&
    ['production', 'preview'].includes(env.DEPLOYMENT_ENVIRONMENT) &&
    /^[a-f0-9]{40}$/.test(env.RELEASE_REVISION || '') && Boolean(env.WORKER_VERSION_METADATA?.id);
  return Response.json({
    status: ok ? 'ok' : 'error',
    environment: env.DEPLOYMENT_ENVIRONMENT || 'unconfigured',
    revision: env.RELEASE_REVISION || null,
    versionId: env.WORKER_VERSION_METADATA?.id || null,
  }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
