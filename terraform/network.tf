# -----------------------------------------------------------------------------
# DevShop — networking: VPC, public subnet, Internet Gateway, route table.
#
# Single public subnet pattern — the EC2 host (frontends + backend + PostgreSQL
# containers) lives directly on a public subnet with a normal public IPv4. No
# NAT gateway / private subnet / Elastic IP is needed for this phase because the
# whole stack runs on one host and all outbound traffic goes through the
# Internet Gateway.
# -----------------------------------------------------------------------------

resource "aws_vpc" "devshop" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.devshop.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-subnet"
  }
}

resource "aws_internet_gateway" "devshop" {
  vpc_id = aws_vpc.devshop.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.devshop.id

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.devshop.id
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}
