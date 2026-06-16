# ============================================================
# AIFUT Region Module — VPC, ALB, Auto Scaling, EC2
# ============================================================
# This module provisions the network + compute stack for a
# single geographic region. Each region gets:
#   - VPC with public/private subnets
#   - Internet Gateway + NAT Gateway
#   - Application Load Balancer (internet-facing)
#   - Auto Scaling Group with EC2 (Docker hosts)
#   - CloudWatch logging + alarms

terraform {
  required_version = ">= 1.8.0"
}

# ─── Variables ──────────────────────────────────────────

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

# ─── Data Sources ───────────────────────────────────────

data "aws_availability_zones" "available" {
  state = "available"
}

# ─── VPC ────────────────────────────────────────────────

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "aifut-${var.region_slug}-vpc"
  }
}

# Public subnets (ALB, NAT Gateway)
resource "aws_subnet" "public" {
  count             = min(3, length(data.aws_availability_zones.available.names))
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "aifut-${var.region_slug}-public-${count.index}"
  }
}

# Private subnets (EC2 instances)
resource "aws_subnet" "private" {
  count             = min(3, length(data.aws_availability_zones.available.names))
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "aifut-${var.region_slug}-private-${count.index}"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "aifut-${var.region_slug}-igw"
  }
}

# NAT Elastic IP
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "aifut-${var.region_slug}-nat-eip"
  }
}

# NAT Gateway
resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "aifut-${var.region_slug}-nat"
  }

  depends_on = [aws_internet_gateway.this]
}

# Public route table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = {
    Name = "aifut-${var.region_slug}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private route table
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }

  tags = {
    Name = "aifut-${var.region_slug}-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ─── Security Groups ────────────────────────────────────

resource "aws_security_group" "alb" {
  name        = "aifut-${var.region_slug}-alb-sg"
  description = "ALB security group for AIFUT ${var.region_slug}"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS from anywhere"
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP redirect"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "aifut-${var.region_slug}-alb-sg"
  }
}

resource "aws_security_group" "ec2" {
  name        = "aifut-${var.region_slug}-ec2-sg"
  description = "EC2 security group for AIFUT ${var.region_slug}"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Web UI from ALB"
  }

  ingress {
    from_port       = 3002
    to_port         = 3002
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "API from ALB"
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = []  # No direct SSH — use SSM
    description = "SSH (disabled — use SSM)"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "aifut-${var.region_slug}-ec2-sg"
  }
}

# ─── Application Load Balancer ──────────────────────────

resource "aws_lb" "this" {
  name               = "aifut-${var.region_slug}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = true
  idle_timeout               = 60

  tags = {
    Name = "aifut-${var.region_slug}-alb"
  }
}

# HTTPS listener (primary)
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# HTTP → HTTPS redirect
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ─── Target Groups ──────────────────────────────────────

resource "aws_lb_target_group" "web" {
  name     = "aifut-${var.region_slug}-web-tg"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = aws_vpc.this.id

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }

  tags = {
    Name = "aifut-${var.region_slug}-web-tg"
  }
}

resource "aws_lb_target_group" "api" {
  name     = "aifut-${var.region_slug}-api-tg"
  port     = 3002
  protocol = "HTTP"
  vpc_id   = aws_vpc.this.id

  health_check {
    path                = "/__health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }

  tags = {
    Name = "aifut-${var.region_slug}-api-tg"
  }
}

# ─── ALB Listener Rules ────────────────────────────────

resource "aws_lb_listener_rule" "web" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  condition {
    host_header {
      values = [var.domain]
    }
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }
}

# ─── Launch Template ────────────────────────────────────

resource "aws_launch_template" "this" {
  name_prefix   = "aifut-${var.region_slug}-"
  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = var.instance_type

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.volume_size_gb
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  network_interfaces {
    associate_public_ip       = false
    security_groups           = [aws_security_group.ec2.id]
    delete_on_termination     = true
  }

  iam_instance_profile {
    name = aws_iam_instance_profile.this.name
  }

  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    region_slug = var.region_slug
    environment = var.environment
    domain      = var.domain
    api_domain  = var.api_domain
    locale      = var.locale
    currency    = var.currency
    log_group   = "/aifut/${var.region_slug}/${var.environment}"
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "aifut-${var.region_slug}-ec2"
      Environment = var.environment
      Region      = var.region_slug
    }
  }
}

# AMI lookup
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ─── IAM Role & Instance Profile ───────────────────────

resource "aws_iam_role" "this" {
  name = "aifut-${var.region_slug}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_instance_profile" "this" {
  name = "aifut-${var.region_slug}-instance-profile"
  role = aws_iam_role.this.name
}

# ─── Auto Scaling Group ────────────────────────────────

resource "aws_autoscaling_group" "this" {
  name                = "aifut-${var.region_slug}-asg"
  vpc_zone_identifier = aws_subnet.private[*].id
  min_size            = var.min_size
  max_size            = var.max_size
  desired_capacity    = var.desired_size
  health_check_type   = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.this.id
    version = "$Latest"
  }

  target_group_arns = [
    aws_lb_target_group.web.arn,
    aws_lb_target_group.api.arn,
  ]

  tag {
    key                 = "Name"
    value               = "aifut-${var.region_slug}-asg"
    propagate_at_launch = true
  }
}

# ─── CloudWatch Logs ────────────────────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aifut/${var.region_slug}/${var.environment}/app"
  retention_in_days = var.log_retention_days

  tags = {
    Environment = var.environment
    Region      = var.region_slug
  }
}

resource "aws_cloudwatch_log_group" "nginx" {
  name              = "/aifut/${var.region_slug}/${var.environment}/nginx"
  retention_in_days = var.log_retention_days
}

# ─── Monitoring Alarms ─────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "AIFUT-${var.region_slug}-HighCPU-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "CPU > 80% for region: ${var.region_slug}"
  alarm_actions       = []

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.this.name
  }
}

# ─── Outputs ───────────────────────────────────────────

output "vpc_id" {
  value = aws_vpc.this.id
}

output "alb_arn" {
  value = aws_lb.this.arn
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "asg_name" {
  value = aws_autoscaling_group.this.name
}

output "region_slug" {
  value = var.region_slug
}
