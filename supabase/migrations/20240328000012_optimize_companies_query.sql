-- Enable the pg_trgm extension first
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_companies_with_count;

-- Create the optimized companies query function
CREATE OR REPLACE FUNCTION get_companies_with_count(
    p_organization_id uuid DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_neighborhood text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0,
    p_sort_field text DEFAULT 'created_at',
    p_sort_order text DEFAULT 'desc'
)
RETURNS TABLE (
    companies json,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_companies AS (
        SELECT c.*
        FROM companies c
        WHERE (c.deleted_at IS NULL)
        AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
        AND (p_type IS NULL OR c.type = p_type)
        AND (p_neighborhood IS NULL OR c.neighborhood = p_neighborhood)
        AND (
            p_search IS NULL OR 
            c.name ILIKE '%' || p_search || '%' OR
            c.type ILIKE '%' || p_search || '%' OR
            COALESCE(c.street_address, '') ILIKE '%' || p_search || '%' OR
            COALESCE(c.city, '') ILIKE '%' || p_search || '%'
        )
    )
    SELECT 
        COALESCE(
            (
                SELECT json_agg(t)
                FROM (
                    SELECT *
                    FROM filtered_companies
                    ORDER BY
                        CASE 
                            WHEN p_sort_field = 'name' AND p_sort_order = 'asc' THEN name END ASC,
                        CASE 
                            WHEN p_sort_field = 'name' AND p_sort_order = 'desc' THEN name END DESC,
                        CASE 
                            WHEN p_sort_field = 'type' AND p_sort_order = 'asc' THEN type END ASC,
                        CASE 
                            WHEN p_sort_field = 'type' AND p_sort_order = 'desc' THEN type END DESC,
                        CASE 
                            WHEN p_sort_field = 'created_at' AND p_sort_order = 'asc' THEN created_at END ASC,
                        CASE 
                            WHEN p_sort_field = 'created_at' AND p_sort_order = 'desc' OR p_sort_field IS NULL THEN created_at END DESC
                    LIMIT p_limit
                    OFFSET p_offset
                ) t
            ),
            '[]'::json
        ) AS companies,
        COUNT(*) OVER() AS total_count
    FROM filtered_companies
    LIMIT 1;
END;
$$;

-- Create indexes to support the common query patterns
DROP INDEX IF EXISTS idx_companies_search;
DROP INDEX IF EXISTS idx_companies_filters;
DROP INDEX IF EXISTS idx_companies_sort;
DROP INDEX IF EXISTS idx_companies_sort_created;
DROP INDEX IF EXISTS idx_companies_sort_name;
DROP INDEX IF EXISTS idx_companies_sort_type;

-- Create btree indexes for basic operations
CREATE INDEX idx_companies_filters ON companies (organization_id, type, neighborhood, deleted_at);
CREATE INDEX idx_companies_sort_created ON companies (created_at DESC NULLS LAST);
CREATE INDEX idx_companies_sort_name ON companies (name ASC NULLS LAST);
CREATE INDEX idx_companies_sort_type ON companies (type ASC NULLS LAST);

-- Create trigram indexes for text search
CREATE INDEX idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);
CREATE INDEX idx_companies_type_trgm ON companies USING gin (type gin_trgm_ops);
CREATE INDEX idx_companies_address_trgm ON companies USING gin (street_address gin_trgm_ops);
CREATE INDEX idx_companies_city_trgm ON companies USING gin (city gin_trgm_ops);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_companies_with_count TO authenticated; 