# ============================================================
# AIFUT Multi-Region Infrastructure — Terraform Root Module
# ============================================================
# Terraform v1.8+ — Provisions Cloudflare, AWS EC2/Lightsail,
# and monitoring infrastructure across all AIFUT regions.
#
# Regions: vn (Vietnam), sg (Singapore), jp (Japan),
#          us (United States), th (Thailand)
#
# Usage:
#   terraform init
#   terraform plan -var-file="terraform.tfvars"
#   terraform apply -var-file="terraform.tfvars"
# ============================================================

terraform {
  required_version = ">= 1.8.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.30"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }

  # Backend: S3 for state sharing across team
  backend "s3" {
    bucket         = "aifut-terraform-state"
    key            = "aifut-multi-region/terraform.tfstate"
    region         = "ap-southeast-1"
    encrypt        = true
    dynamodb_table = "aifut-terraform-locks"
  }
}

# ─── Providers ──────────────────────────────────────────────

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "aws" {
  alias  = "vietnam"
  region = "ap-southeast-1"  # Singapore (nearest to VN)

  default_tags {
    tags = {
      Project     = "AIFUT"
      Region      = "vn"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "singapore"
  region = "ap-southeast-1"

  default_tags {
    tags = {
      Project     = "AIFUT"
      Region      = "sg"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "japan"
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project     = "AIFUT"
      Region      = "jp"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "usa"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "AIFUT"
      Region      = "us"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "thailand"
  region = "ap-southeast-1"  # Singapore (nearest to TH)

  default_tags {
    tags = {
      Project     = "AIFUT"
      Region      = "th"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ─── Variables ──────────────────────────────────────────────

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS, Workers, and Zone permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for aifut.app"
  type        = string
}

variable "environment" {
  description = "Deployment environment: staging / production"
  type        = string
  default     = "production"
}

variable "region_configs" {
  description = "Per-region infrastructure configuration"
  type = map(object({
    enabled            = bool
    aws_provider_alias = string
    instance_type      = string
    min_size           = number
    max_size           = number
    desired_size       = number
    domain             = string
    api_domain         = string
    locale             = string
    currency           = string
    volume_size_gb     = number
  }))
  default = {
    vn = {
      enabled            = true
      aws_provider_alias = "vietnam"
      instance_type      = "t3.medium"
      min_size           = 1
      max_size           = 3
      desired_size       = 1
      domain             = "aifut.app"
      api_domain         = "api.aifut.app"
      locale             = "vi"
      currency           = "VND"
      volume_size_gb     = 30
    }
    sg = {
      enabled            = true
      aws_provider_alias = "singapore"
      instance_type      = "t3.small"
      min_size           = 1
      max_size           = 2
      desired_size       = 1
      domain             = "aifut-sg.app"
      api_domain         = "api-sg.aifut.app"
      locale             = "en"
      currency           = "SGD"
      volume_size_gb     = 20
    }
    jp = {
      enabled            = true
      aws_provider_alias = "japan"
      instance_type      = "t3.small"
      min_size           = 1
      max_size           = 2
      desired_size       = 1
      domain             = "aifut-jp.app"
      api_domain         = "api-jp.aifut.app"
      locale             = "ja"
      currency           = "JPY"
      volume_size_gb     = 20
    }
    us = {
      enabled            = true
      aws_provider_alias = "usa"
      instance_type      = "t3.medium"
      min_size           = 1
      max_size           = 3
      desired_size       = 1
      domain             = "aifut-us.app"
      api_domain         = "api-us.aifut.app"
      locale             = "en"
      currency           = "USD"
      volume_size_gb     = 40
    }
    th = {
      enabled            = true
      aws_provider_alias = "thailand"
      instance_type      = "t3.small"
      min_size           = 1
      max_size           = 2
      desired_size       = 1
      domain             = "aifut-th.app"
      api_domain         = "api-th.aifut.app"
      locale             = "th"
      currency           = "THB"
      volume_size_gb     = 20
    }
  }
}

variable "cloudwatch_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "enable_monitoring" {
  description = "Deploy monitoring stack (CloudWatch dashboards, alarms)"
  type        = bool
  default     = true
}

# ─── Cloudflare — DNS & Workers ────────────────────────────

# Edge Router Worker (deployed via wrangler, but DNS managed here)
resource "cloudflare_record" "edge_health" {
  zone_id = var.cloudflare_zone_id
  name    = "__health"
  type    = "A"
  value   = "192.0.2.1"  # Placeholder — Worker routes handle this
  proxied = true
  ttl     = 1
}

# Regional DNS records
resource "cloudflare_record" "regional_api" {
  for_each = {
    for slug, cfg in var.region_configs : slug => cfg if cfg.enabled
  }

  zone_id = var.cloudflare_zone_id
  name    = split(".", each.value.api_domain)[0]
  type    = "A"
  value   = "192.0.2.254"  # Placeholder — resolved via Worker
  proxied = true
  ttl     = 1
}

# ─── Application Load Balancers (per region) ──────────────

module "region_vn" {
  source = "./modules/region"
  providers = {
    aws = aws.vietnam
  }
  count = var.region_configs["vn"].enabled ? 1 : 0

  region_slug       = "vn"
  environment       = var.environment
  vpc_cidr          = "10.1.0.0/16"
  instance_type     = var.region_configs["vn"].instance_type
  min_size          = var.region_configs["vn"].min_size
  max_size          = var.region_configs["vn"].max_size
  desired_size      = var.region_configs["vn"].desired_size
  domain            = var.region_configs["vn"].domain
  api_domain        = var.region_configs["vn"].api_domain
  volume_size_gb    = var.region_configs["vn"].volume_size_gb
  locale            = var.region_configs["vn"].locale
  currency          = var.region_configs["vn"].currency
  log_retention_days = var.cloudwatch_retention_days
  enable_monitoring  = var.enable_monitoring
}

module "region_sg" {
  source = "./modules/region"
  providers = {
    aws = aws.singapore
  }
  count = var.region_configs["sg"].enabled ? 1 : 0

  region_slug       = "sg"
  environment       = var.environment
  vpc_cidr          = "10.2.0.0/16"
  instance_type     = var.region_configs["sg"].instance_type
  min_size          = var.region_configs["sg"].min_size
  max_size          = var.region_configs["sg"].max_size
  desired_size      = var.region_configs["sg"].desired_size
  domain            = var.region_configs["sg"].domain
  api_domain        = var.region_configs["sg"].api_domain
  volume_size_gb    = var.region_configs["sg"].volume_size_gb
  locale            = var.region_configs["sg"].locale
  currency          = var.region_configs["sg"].currency
  log_retention_days = var.cloudwatch_retention_days
  enable_monitoring  = var.enable_monitoring
}

module "region_jp" {
  source = "./modules/region"
  providers = {
    aws = aws.japan
  }
  count = var.region_configs["jp"].enabled ? 1 : 0

  region_slug       = "jp"
  environment       = var.environment
  vpc_cidr          = "10.3.0.0/16"
  instance_type     = var.region_configs["jp"].instance_type
  min_size          = var.region_configs["jp"].min_size
  max_size          = var.region_configs["jp"].max_size
  desired_size      = var.region_configs["jp"].desired_size
  domain            = var.region_configs["jp"].domain
  api_domain        = var.region_configs["jp"].api_domain
  volume_size_gb    = var.region_configs["jp"].volume_size_gb
  locale            = var.region_configs["jp"].locale
  currency          = var.region_configs["jp"].currency
  log_retention_days = var.cloudwatch_retention_days
  enable_monitoring  = var.enable_monitoring
}

module "region_us" {
  source = "./modules/region"
  providers = {
    aws = aws.usa
  }
  count = var.region_configs["us"].enabled ? 1 : 0

  region_slug       = "us"
  environment       = var.environment
  vpc_cidr          = "10.4.0.0/16"
  instance_type     = var.region_configs["us"].instance_type
  min_size          = var.region_configs["us"].min_size
  max_size          = var.region_configs["us"].max_size
  desired_size      = var.region_configs["us"].desired_size
  domain            = var.region_configs["us"].domain
  api_domain        = var.region_configs["us"].api_domain
  volume_size_gb    = var.region_configs["us"].volume_size_gb
  locale            = var.region_configs["us"].locale
  currency          = var.region_configs["us"].currency
  log_retention_days = var.cloudwatch_retention_days
  enable_monitoring  = var.enable_monitoring
}

module "region_th" {
  source = "./modules/region"
  providers = {
    aws = aws.thailand
  }
  count = var.region_configs["th"].enabled ? 1 : 0

  region_slug       = "th"
  environment       = var.environment
  vpc_cidr          = "10.5.0.0/16"
  instance_type     = var.region_configs["th"].instance_type
  min_size          = var.region_configs["th"].min_size
  max_size          = var.region_configs["th"].max_size
  desired_size      = var.region_configs["th"].desired_size
  domain            = var.region_configs["th"].domain
  api_domain        = var.region_configs["th"].api_domain
  volume_size_gb    = var.region_configs["th"].volume_size_gb
  locale            = var.region_configs["th"].locale
  currency          = var.region_configs["th"].currency
  log_retention_days = var.cloudwatch_retention_days
  enable_monitoring  = var.enable_monitoring
}

# ─── Global Monitoring ────────────────────────────────────

# Centralized CloudWatch dashboard
resource "aws_cloudwatch_dashboard" "aifut_global" {
  count = var.enable_monitoring ? 1 : 0
  dashboard_name = "AIFUT-Global-${var.environment}"

  dashboard_body = jsonencode({
    widgets = concat(
      [
        for slug, cfg in var.region_configs : {
          type = "metric"
          x    = 0
          y    = length(keys(var.region_configs)) - index(keys(var.region_configs), slug) - 1
          width = 24
          height = 6
          properties = {
            metrics = [
              [ "AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", "${slug}-alb" ],
              [ ".", "RequestCount", ".", "." ],
              [ ".", "HTTPCode_Target_5XX_Count", ".", "." ]
            ]
            period = 300
            stat   = "Average"
            region = "ap-southeast-1"
            title  = "${slug} (${cfg.domain})"
          }
        }
      ]
    )
  })
}

# Global health alarm
resource "aws_cloudwatch_metric_alarm" "global_health" {
  for_each = {
    for slug, cfg in var.region_configs : slug => cfg if cfg.enabled
  }

  alarm_name          = "AIFUT-${each.key}-HighErrorRate-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "High 5XX error rate for region: ${each.key}"
  alarm_actions       = []  # Add SNS topic ARN here

  dimensions = {
    LoadBalancer = "${each.key}-alb"
  }
}

# ─── Outputs ─────────────────────────────────────────────

output "region_endpoints" {
  description = "Regional API endpoint URLs"
  value = {
    for slug, cfg in var.region_configs : slug => "https://${cfg.api_domain}" if cfg.enabled
  }
}

output "cloudflare_zone" {
  description = "Cloudflare Zone ID"
  value       = var.cloudflare_zone_id
  sensitive   = true
}

output "monitoring_dashboard" {
  description = "CloudWatch dashboard URL"
  value       = var.enable_monitoring ? "https://${data.aws_region.current.name}.console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=AIFUT-Global-${var.environment}" : null
}

data "aws_region" "current" {}
