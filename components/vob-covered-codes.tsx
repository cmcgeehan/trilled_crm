import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { Database } from "@/types/supabase"
import { toast } from "react-hot-toast"
import { Trash2 } from "lucide-react"

type VOBCoveredCode = Database['public']['Tables']['vob_covered_codes']['Row']

interface VOBCoveredCodesProps {
  vobRecordId: string
}

export function VOBCoveredCodes({ vobRecordId }: VOBCoveredCodesProps) {
  const [coveredCodes, setCoveredCodes] = useState<VOBCoveredCode[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    covered_for_telehealth: false,
    authorization_required: false,
  })

  const loadCoveredCodes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vob_covered_codes')
        .select('*')
        .eq('vob_record_id', vobRecordId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCoveredCodes(data || [])
    } catch (err) {
      console.error('Error loading covered codes:', err)
      toast.error('Failed to load covered codes')
    } finally {
      setLoading(false)
    }
  }, [vobRecordId])

  useEffect(() => {
    loadCoveredCodes()
  }, [vobRecordId, loadCoveredCodes])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const { error } = await supabase
        .from('vob_covered_codes')
        .insert({
          vob_record_id: vobRecordId,
          code: parseInt(formData.code),
          description: formData.description,
          covered_for_telehealth: formData.covered_for_telehealth,
          authorization_required: formData.authorization_required,
        })
        .select()
        .single()

      if (error) throw error

      toast.success('Covered code added successfully')
      setFormData({
        code: "",
        description: "",
        covered_for_telehealth: false,
        authorization_required: false,
      })
      loadCoveredCodes()
    } catch (err) {
      console.error('Error adding covered code:', err)
      toast.error('Failed to add covered code')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (codeId: string) => {
    try {
      const { error } = await supabase
        .from('vob_covered_codes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', codeId)

      if (error) throw error

      toast.success('Covered code deleted successfully')
      loadCoveredCodes()
    } catch (err) {
      console.error('Error deleting covered code:', err)
      toast.error('Failed to delete covered code')
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Covered Codes</CardTitle>
        </CardHeader>
        <CardContent>
          {coveredCodes.length === 0 ? (
            <p className="text-gray-500">No covered codes found</p>
          ) : (
            <div className="space-y-4">
              {coveredCodes.map((code) => (
                <div key={code.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">Code {code.code}</h3>
                      <p className="text-sm text-gray-500">{code.description}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {code.covered_for_telehealth && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Telehealth Covered
                        </span>
                      )}
                      {code.authorization_required && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                          Auth Required
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(code.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Covered Code</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                type="number"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="covered_for_telehealth"
                checked={formData.covered_for_telehealth}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, covered_for_telehealth: checked as boolean }))}
              />
              <Label htmlFor="covered_for_telehealth">Covered for Telehealth</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="authorization_required"
                checked={formData.authorization_required}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, authorization_required: checked as boolean }))}
              />
              <Label htmlFor="authorization_required">Authorization Required</Label>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Code'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
} 