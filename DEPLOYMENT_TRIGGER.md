#!/bin/bash
# Deployment trigger script for Render
# This file forces a new deployment when changed

echo "=== TAX SALE SYSTEM DEPLOYMENT ==="
echo "Deploy Date: $(date)"
echo "Dynamic URL Fetching: ENABLED"
echo "Current Tax Sale ID: bbcf4bac-48f3-47fe-894c-18397e65ebff"
echo "Expected Properties: ~30 (updated Aug 2025)"
echo "Previous Properties: 170 (old cached data)"
echo "====================================="

# Version: 2.1.0 - Dynamic URL Fetching Implementation
# Last Updated: August 4, 2025
# Changes: Added dynamic URL fetching from tax.chathamcountyga.gov/TaxSaleList
