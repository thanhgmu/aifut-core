variable "region_slug" {
  description = "Region identifier (vn, sg, jp, us, th)"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "VPC CIDR block for this region"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "min_size" {
  description = "Minimum instances in Auto Scaling Group"
  type        = number
  default     = 1
}

variable "max_size" {
  description = "Maximum instances in Auto Scaling Group"
  type        = number
  default     = 3
}

variable "desired_size" {
  description = "Desired instance count"
  type        = number
  default     = 1
}

variable "domain" {
  description = "Web UI domain for this region"
  type        = string
}

variable "api_domain" {
  description = "API domain for this region"
  type        = string
}

variable "volume_size_gb" {
  description = "EBS volume size in GB"
  type        = number
  default     = 30
}

variable "locale" {
  description = "Default locale for this region"
  type        = string
}

variable "currency" {
  description = "Default currency for this region"
  type        = string
}

variable "certificate_arn" {
  description = "ACM Certificate ARN for HTTPS"
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "enable_monitoring" {
  description = "Enable CloudWatch monitoring and dashboards"
  type        = bool
  default     = true
}
