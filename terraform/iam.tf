# -----------------------------------------------------------------------------
# DevShop — IAM for the EC2 instance.
#
# Least privilege: the current application runs entirely in Docker on the host
# and makes NO AWS API calls. Therefore the instance role carries NO managed
# policies — it exists so the instance has an identity and so a policy can be
# attached cleanly in a later phase (ECR pull, CloudWatch, SSM) without
# redesigning this file.
#
# If you later want SSM Session Manager / EC2 Image Builder / ECR access,
# attach the corresponding AWS managed policy (e.g. AmazonSSMManagedInstanceCore)
# to this role. Do NOT add AdministratorAccess.
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "devshop_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "devshop_ec2" {
  name               = "${var.project_name}-ec2-role"
  description        = "Instance role for the DevShop EC2 host. No AWS API permissions are granted in this phase (least privilege)."
  assume_role_policy = data.aws_iam_policy_document.devshop_assume_role.json

  tags = {
    Name = "${var.project_name}-ec2-role"
  }
}

resource "aws_iam_instance_profile" "devshop" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.devshop_ec2.name
}
