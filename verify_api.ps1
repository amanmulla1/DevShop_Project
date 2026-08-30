# Verify API products and categories
$response = Invoke-WebRequest -Uri http://localhost:8080/api/products -UseBasicParsing
$products = $response.Content | ConvertFrom-Json

Write-Host "============================================"
Write-Host "API VERIFICATION - Products"
Write-Host "============================================"
Write-Host "Total products: $($products.Count)"
Write-Host ""

# Count by category
$categories = @{}
$products | ForEach-Object {
    $cat = $_.category
    if ($categories.ContainsKey($cat)) {
        $categories[$cat]++
    } else {
        $categories[$cat] = 1
    }
}

Write-Host "Category Distribution:"
$categories.GetEnumerator() | Sort-Object Name | ForEach-Object {
    Write-Host "$($_.Key): $($_.Value)"
}

# Verify all categories present
Write-Host ""
Write-Host "Verification:"
$expected = @{
    "Cloud" = 3
    "DevOps" = 3
    "Kubernetes" = 3
    "Monitoring" = 3
    "Containers" = 2
    "Infrastructure" = 2
}

$allCorrect = $true
foreach ($key in $expected.Keys) {
    $cat = $key
    $expected_count = $expected[$cat]
    $actual_count = $categories[$cat]
    if ($actual_count -eq $expected_count) {
        Write-Host "OK: $cat = $actual_count"
    } else {
        Write-Host "FAIL: $cat expected $expected_count, got $actual_count"
        $allCorrect = $false
    }
}

Write-Host ""
if ($allCorrect) {
    Write-Host "SUCCESS: All categories verified!"
} else {
    Write-Host "FAILURE: Category verification failed"
}
