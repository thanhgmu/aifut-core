# AIFUT Region Module

This Terraform module provisions the full infrastructure stack for a single AIFUT geographic region.

## Resources Created

- **VPC** with public/private subnets across 3 AZs
- **Internet Gateway** + **NAT Gateway** for outbound traffic
- **Application Load Balancer** (internet-facing, HTTPS)
- **Auto Scaling Group** with EC2 instances (Docker hosts)
- **IAM Role** with SSM + ECR access
- **CloudWatch Log Groups** + **Metric Alarms**
- **Security Groups** for ALB and EC2

## Inputs

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| region_slug | string | — | Region identifier (vn, sg, jp, us, th) |
| environment | string | production | Deployment environment |
| vpc_cidr | string | — | VPC CIDR block |
| instance_type | string | t3.medium | EC2 instance type |
| min/max/desired_size | number | 1/3/1 | ASG scaling limits |
| domain | string | — | Web UI domain |
| api_domain | string | — | API domain |
| volume_size_gb | number | 30 | EBS volume size |
| locale/currency | string | — | Region defaults |
| certificate_arn | string | "" | ACM cert for HTTPS |
| enable_monitoring | bool | true | CloudWatch + alarms |

## Outputs

- `vpc_id` — VPC ID
- `alb_arn` — ALB ARN
- `alb_dns_name` — ALB DNS name
- `asg_name` — Auto Scaling Group name
- `region_slug` — Region identifier

## Integration

This module is called from `infra/terraform/main.tf` once per enabled region. The Edge Worker at `infra/edge/src/index.ts` routes traffic to the ALB DNS name based on geo-location and health state.
