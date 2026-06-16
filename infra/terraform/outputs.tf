# ============================================================
# AIFUT Terraform — Outputs
# ============================================================

output "cloudflare_dns_records" {
  description = "Map of regional DNS records created in Cloudflare"
  value = {
    for slug, cfg in var.region_configs : slug => {
      api_domain = cfg.api_domain
      dns_record = slug == "vn" ? "api.aifut.app" : "api-${slug}.aifut.app"
    } if cfg.enabled
  }
}

output "region_vpc_ids" {
  description = "VPC IDs created per region"
  value = merge(
    var.region_configs["vn"].enabled ? { vn = module.region_vn[0].vpc_id } : {},
    var.region_configs["sg"].enabled ? { sg = module.region_sg[0].vpc_id } : {},
    var.region_configs["jp"].enabled ? { jp = module.region_jp[0].vpc_id } : {},
    var.region_configs["us"].enabled ? { us = module.region_us[0].vpc_id } : {},
    var.region_configs["th"].enabled ? { th = module.region_th[0].vpc_id } : {},
  )
}

output "region_alb_arns" {
  description = "Application Load Balancer ARNs per region"
  value = merge(
    var.region_configs["vn"].enabled ? { vn = module.region_vn[0].alb_arn } : {},
    var.region_configs["sg"].enabled ? { sg = module.region_sg[0].alb_arn } : {},
    var.region_configs["jp"].enabled ? { jp = module.region_jp[0].alb_arn } : {},
    var.region_configs["us"].enabled ? { us = module.region_us[0].alb_arn } : {},
    var.region_configs["th"].enabled ? { th = module.region_th[0].alb_arn } : {},
  )
}

output "deployment_commands" {
  description = "Post-deployment commands for edge router and region services"
  value = <<-EOT
    # === AIFUT Post-Deployment Steps ===

    # 1. Deploy Edge Worker
    cd infra/edge
    npm run deploy:production

    # 2. Set Worker Secrets
    npx wrangler secret put EDGE_AUTH_TOKEN --name aifut-edge-router
    npx wrangler secret put INTERNAL_API_KEY --name aifut-edge-router

    # 3. Populate Region Config (KV)
    npx wrangler kv key put regions --namespace-id=REGION_KV_ID --path=infra/edge/region-config.json

    # 4. Deploy Regional Services
    bash infra/deploy-region.sh vn
    bash infra/deploy-region.sh sg
    bash infra/deploy-region.sh jp
    bash infra/deploy-region.sh us
    bash infra/deploy-region.sh th

    # 5. Verify Health
    curl https://api.aifut.app/__health
    curl https://api-sg.aifut.app/__health
  EOT
}
