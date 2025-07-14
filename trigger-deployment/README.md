# 🚀 Trigger Remote Deployment

This GitHub Action reads a local **deployment or job manifest**, updates its image tag with the current commit SHA, and triggers a remote workflow in another repository using `workflow_dispatch`.

---

## 📦 Inputs

| Name           | Required | Description                                                                 |
| -------------- | -------- | --------------------------------------------------------------------------- |
| `file`         | Yes      | Path to the local deployment manifest json file (`deploy.json`).            |
| `tag`          | Yes      | Tag to use for the image (e.g. `v1.2.3` or SHA).                            |
| `github_token` | Yes      | GitHub token with permission to trigger workflows in the target repository. |

---

## ✅ Example Usage

```yaml
- name: Trigger Remote Deployment
  uses: sh-proptech/actions/trigger-deploy@v1
  with:
    file: ./deploy.json
    tag: ${{ github.sha }}
    github_token: ${{ secrets.GH_PAT_TOKEN }}
```
