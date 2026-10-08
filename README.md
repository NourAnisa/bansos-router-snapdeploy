# bansos-router — SnapDeploy

Docker deployment for [bansos-router](https://github.com/ihsan-ramadhan/bansos-router) on SnapDeploy.

## Deployment

1. On SnapDeploy, choose **Deploy from GitHub**.
2. Select `NourAnisa/bansos-router-snapdeploy` and branch `main`.
3. Choose Dockerfile build and expose **container port 17070**.
4. Set environment variable `PORT=17070` if SnapDeploy allows specifying the port.
5. Deploy and inspect logs. Test `/healthz` and the dashboard.

## Important security warning

**Do not expose this image on an unrestricted public URL.** The application is intended primarily as a local daemon, and the flags in the example Dockerfile deliberately enable listening beyond localhost. An unauthenticated public instance can expose router configuration, endpoints, and resources.

Before making this publicly reachable, require authentication and access controls in front of the **entire application**, including `/v1/*`, `/healthz` (if needed), dashboard routes, and configuration/mutation routes. Prefer private networking or access-gated ingress. Do not put secrets in GitHub or the Dockerfile. Follow the upstream security documentation.

The container filesystem is ephemeral unless SnapDeploy offers persistent volumes. Model availability and upstream access depend on external services.

## Local test

```bash
docker build -t bansos-router-snapdeploy .
docker run --rm -p 127.0.0.1:17070:17070 bansos-router-snapdeploy
```

Then open http://127.0.0.1:17070/ and http://127.0.0.1:17070/healthz.
