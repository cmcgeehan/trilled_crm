import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { format } from "date-fns"
import { supabase } from "@/lib/supabase"
import { Database } from "@/types/supabase"
import { toast } from "react-hot-toast"
import { VOBCoveredCodes } from "./vob-covered-codes"
import { Plus } from "lucide-react"

type VOBRecord = Database['public']['Tables']['vob_records']['Row']

interface VOBFormProps {
  userId: string
}

export function VOBForm({ userId }: VOBFormProps) {
  const [vobRecords, setVobRecords] = useState<VOBRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<VOBRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showNewVOBDialog, setShowNewVOBDialog] = useState(false)
  const [formData, setFormData] = useState({
    reference_id: "",
    rep_spoke_to: "",
    relationship_to_subscriber: "",
    dependent_ages: "",
    subscriber_address: "",
    cob_info: "",
    plan_type: "",
    policy_type: "",
    subscriber_name: "",
    plan_year: "",
    funding_type: "",
    effective_date: "",
    termination_date: "",
    payment_destination: "facility" as "facility" | "patient",
    deductible: "",
    deductible_met: "",
    out_of_pocket: "",
    out_of_pocket_met: "",
    coinsurance: "",
    copay: "",
    deductible_applies_to_oop: false,
    cross_accumulate: false,
    op_coverage: false,
    iop_coverage: false,
    telehealth_coverage: false,
    reimbursement_type: "",
    multi_plan: false,
    notes: "",
    preauth_reference_number: "",
  })

  const loadVOBRecords = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vob_records')
        .select('*')
        .eq('user_id', userId)
        .order('created_date', { ascending: false })

      if (error) throw error
      setVobRecords(data || [])
    } catch (err) {
      console.error('Error loading VOB records:', err)
      toast.error('Failed to load VOB records')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadVOBRecords()
  }, [userId, loadVOBRecords])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const { error: vobError } = await supabase
        .from('vob_records')
        .insert({
          user_id: userId,
          verified_by: session.user.id,
          reference_id: formData.reference_id,
          rep_spoke_to: formData.rep_spoke_to,
          relationship_to_subscriber: formData.relationship_to_subscriber,
          dependent_ages: formData.dependent_ages,
          subscriber_address: formData.subscriber_address,
          cob_info: formData.cob_info,
          plan_type: formData.plan_type,
          policy_type: formData.policy_type,
          subscriber_name: formData.subscriber_name,
          plan_year: formData.plan_year,
          funding_type: formData.funding_type,
          effective_date: formData.effective_date,
          termination_date: formData.termination_date || null,
          payment_destination: formData.payment_destination,
          deductible: formData.deductible ? parseFloat(formData.deductible) : null,
          deductible_met: formData.deductible_met ? parseFloat(formData.deductible_met) : null,
          out_of_pocket: formData.out_of_pocket ? parseFloat(formData.out_of_pocket) : null,
          out_of_pocket_met: formData.out_of_pocket_met ? parseFloat(formData.out_of_pocket_met) : null,
          coinsurance: formData.coinsurance ? parseInt(formData.coinsurance) : null,
          copay: formData.copay ? parseFloat(formData.copay) : null,
          deductible_applies_to_oop: formData.deductible_applies_to_oop,
          cross_accumulate: formData.cross_accumulate,
          op_coverage: formData.op_coverage,
          iop_coverage: formData.iop_coverage,
          telehealth_coverage: formData.telehealth_coverage,
          reimbursement_type: formData.reimbursement_type,
          multi_plan: formData.multi_plan,
          notes: formData.notes,
          preauth_reference_number: formData.preauth_reference_number,
        })
        .select()
        .single()

      if (vobError) throw vobError

      toast.success('VOB record submitted successfully')
      setFormData({
        reference_id: "",
        rep_spoke_to: "",
        relationship_to_subscriber: "",
        dependent_ages: "",
        subscriber_address: "",
        cob_info: "",
        plan_type: "",
        policy_type: "",
        subscriber_name: "",
        plan_year: "",
        funding_type: "",
        effective_date: "",
        termination_date: "",
        payment_destination: "facility",
        deductible: "",
        deductible_met: "",
        out_of_pocket: "",
        out_of_pocket_met: "",
        coinsurance: "",
        copay: "",
        deductible_applies_to_oop: false,
        cross_accumulate: false,
        op_coverage: false,
        iop_coverage: false,
        telehealth_coverage: false,
        reimbursement_type: "",
        multi_plan: false,
        notes: "",
        preauth_reference_number: "",
      })
      setShowNewVOBDialog(false)
      loadVOBRecords()
    } catch (err) {
      console.error('Error submitting VOB record:', err)
      toast.error('Failed to submit VOB record')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">VOB Records</h2>
        <Dialog open={showNewVOBDialog} onOpenChange={setShowNewVOBDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New VOB
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Submit New VOB</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="reference_id">Reference ID</Label>
                  <Input
                    id="reference_id"
                    value={formData.reference_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, reference_id: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="rep_spoke_to">Rep Spoke To</Label>
                  <Input
                    id="rep_spoke_to"
                    value={formData.rep_spoke_to}
                    onChange={(e) => setFormData(prev => ({ ...prev, rep_spoke_to: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="relationship_to_subscriber">Relationship to Subscriber</Label>
                  <Input
                    id="relationship_to_subscriber"
                    value={formData.relationship_to_subscriber}
                    onChange={(e) => setFormData(prev => ({ ...prev, relationship_to_subscriber: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="subscriber_name">Subscriber Name</Label>
                  <Input
                    id="subscriber_name"
                    value={formData.subscriber_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, subscriber_name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="plan_type">Plan Type</Label>
                  <Input
                    id="plan_type"
                    value={formData.plan_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, plan_type: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="policy_type">Policy Type</Label>
                  <Input
                    id="policy_type"
                    value={formData.policy_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, policy_type: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="plan_year">Plan Year</Label>
                  <Input
                    id="plan_year"
                    value={formData.plan_year}
                    onChange={(e) => setFormData(prev => ({ ...prev, plan_year: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="funding_type">Funding Type</Label>
                  <Input
                    id="funding_type"
                    value={formData.funding_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, funding_type: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="effective_date">Effective Date</Label>
                  <Input
                    id="effective_date"
                    type="date"
                    value={formData.effective_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, effective_date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="termination_date">Termination Date</Label>
                  <Input
                    id="termination_date"
                    type="date"
                    value={formData.termination_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, termination_date: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="payment_destination">Payment Destination</Label>
                  <Select
                    value={formData.payment_destination}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, payment_destination: value as "facility" | "patient" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facility">Facility</SelectItem>
                      <SelectItem value="patient">Patient</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Coverage Amounts</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="deductible">Deductible</Label>
                    <Input
                      id="deductible"
                      type="number"
                      step="0.01"
                      value={formData.deductible}
                      onChange={(e) => setFormData(prev => ({ ...prev, deductible: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="deductible_met">Deductible Met</Label>
                    <Input
                      id="deductible_met"
                      type="number"
                      step="0.01"
                      value={formData.deductible_met}
                      onChange={(e) => setFormData(prev => ({ ...prev, deductible_met: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="out_of_pocket">Out of Pocket</Label>
                    <Input
                      id="out_of_pocket"
                      type="number"
                      step="0.01"
                      value={formData.out_of_pocket}
                      onChange={(e) => setFormData(prev => ({ ...prev, out_of_pocket: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="out_of_pocket_met">Out of Pocket Met</Label>
                    <Input
                      id="out_of_pocket_met"
                      type="number"
                      step="0.01"
                      value={formData.out_of_pocket_met}
                      onChange={(e) => setFormData(prev => ({ ...prev, out_of_pocket_met: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="coinsurance">Coinsurance (%)</Label>
                    <Input
                      id="coinsurance"
                      type="number"
                      value={formData.coinsurance}
                      onChange={(e) => setFormData(prev => ({ ...prev, coinsurance: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="copay">Copay</Label>
                    <Input
                      id="copay"
                      type="number"
                      step="0.01"
                      value={formData.copay}
                      onChange={(e) => setFormData(prev => ({ ...prev, copay: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Coverage Types</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="deductible_applies_to_oop"
                      checked={formData.deductible_applies_to_oop}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, deductible_applies_to_oop: checked as boolean }))}
                    />
                    <Label htmlFor="deductible_applies_to_oop">Deductible Applies to OOP</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="cross_accumulate"
                      checked={formData.cross_accumulate}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, cross_accumulate: checked as boolean }))}
                    />
                    <Label htmlFor="cross_accumulate">Cross Accumulate</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="op_coverage"
                      checked={formData.op_coverage}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, op_coverage: checked as boolean }))}
                    />
                    <Label htmlFor="op_coverage">OP Coverage</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="iop_coverage"
                      checked={formData.iop_coverage}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, iop_coverage: checked as boolean }))}
                    />
                    <Label htmlFor="iop_coverage">IOP Coverage</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="telehealth_coverage"
                      checked={formData.telehealth_coverage}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, telehealth_coverage: checked as boolean }))}
                    />
                    <Label htmlFor="telehealth_coverage">Telehealth Coverage</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="multi_plan"
                      checked={formData.multi_plan}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, multi_plan: checked as boolean }))}
                    />
                    <Label htmlFor="multi_plan">Multi Plan</Label>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit VOB'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>VOB History</CardTitle>
        </CardHeader>
        <CardContent>
          {vobRecords.length === 0 ? (
            <p className="text-gray-500">No VOB records found</p>
          ) : (
            <div className="space-y-4">
              {vobRecords.map((record) => (
                <div 
                  key={record.id} 
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedRecord?.id === record.id ? 'border-blue-500 bg-blue-50' : ''
                  }`}
                  onClick={() => setSelectedRecord(record)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">VOB Record #{record.version}</h3>
                      <p className="text-sm text-gray-500">
                        Submitted on {format(new Date(record.created_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {record.telehealth_coverage && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Telehealth Covered
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedRecord?.id === record.id ? (
                    <div className="space-y-6 mt-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium">Reference ID</p>
                          <p>{record.reference_id}</p>
                        </div>
                        <div>
                          <p className="font-medium">Rep Spoke To</p>
                          <p>{record.rep_spoke_to}</p>
                        </div>
                        <div>
                          <p className="font-medium">Relationship to Subscriber</p>
                          <p>{record.relationship_to_subscriber}</p>
                        </div>
                        <div>
                          <p className="font-medium">Subscriber Name</p>
                          <p>{record.subscriber_name}</p>
                        </div>
                        <div>
                          <p className="font-medium">Plan Type</p>
                          <p>{record.plan_type}</p>
                        </div>
                        <div>
                          <p className="font-medium">Policy Type</p>
                          <p>{record.policy_type}</p>
                        </div>
                        <div>
                          <p className="font-medium">Plan Year</p>
                          <p>{record.plan_year}</p>
                        </div>
                        <div>
                          <p className="font-medium">Funding Type</p>
                          <p>{record.funding_type}</p>
                        </div>
                        <div>
                          <p className="font-medium">Effective Date</p>
                          <p>{format(new Date(record.effective_date), 'MMM d, yyyy')}</p>
                        </div>
                        <div>
                          <p className="font-medium">Termination Date</p>
                          <p>{record.termination_date ? format(new Date(record.termination_date), 'MMM d, yyyy') : 'N/A'}</p>
                        </div>
                        <div>
                          <p className="font-medium">Payment Destination</p>
                          <p>{record.payment_destination}</p>
                        </div>
                        <div>
                          <p className="font-medium">Subscriber Address</p>
                          <p>{record.subscriber_address}</p>
                        </div>
                        <div>
                          <p className="font-medium">Dependent Ages</p>
                          <p>{record.dependent_ages || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="font-medium">COB Info</p>
                          <p>{record.cob_info || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="font-medium">Reimbursement Type</p>
                          <p>{record.reimbursement_type || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="font-medium">Preauth Reference Number</p>
                          <p>{record.preauth_reference_number || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-semibold">Coverage Amounts</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-medium">Deductible</p>
                            <p>{record.deductible ? `$${record.deductible.toFixed(2)}` : 'N/A'}</p>
                          </div>
                          <div>
                            <p className="font-medium">Deductible Met</p>
                            <p>{record.deductible_met ? `$${record.deductible_met.toFixed(2)}` : 'N/A'}</p>
                          </div>
                          <div>
                            <p className="font-medium">Out of Pocket</p>
                            <p>{record.out_of_pocket ? `$${record.out_of_pocket.toFixed(2)}` : 'N/A'}</p>
                          </div>
                          <div>
                            <p className="font-medium">Out of Pocket Met</p>
                            <p>{record.out_of_pocket_met ? `$${record.out_of_pocket_met.toFixed(2)}` : 'N/A'}</p>
                          </div>
                          <div>
                            <p className="font-medium">Coinsurance</p>
                            <p>{record.coinsurance ? `${record.coinsurance}%` : 'N/A'}</p>
                          </div>
                          <div>
                            <p className="font-medium">Copay</p>
                            <p>{record.copay ? `$${record.copay.toFixed(2)}` : 'N/A'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-semibold">Coverage Types</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center space-x-2">
                            <Checkbox checked={record.deductible_applies_to_oop} disabled />
                            <Label>Deductible Applies to OOP</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox checked={record.cross_accumulate} disabled />
                            <Label>Cross Accumulate</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox checked={record.op_coverage} disabled />
                            <Label>OP Coverage</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox checked={record.iop_coverage} disabled />
                            <Label>IOP Coverage</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox checked={record.telehealth_coverage} disabled />
                            <Label>Telehealth Coverage</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox checked={record.multi_plan} disabled />
                            <Label>Multi Plan</Label>
                          </div>
                        </div>
                      </div>

                      {record.notes && (
                        <div className="space-y-2">
                          <h4 className="font-semibold">Notes</h4>
                          <p className="text-sm whitespace-pre-wrap">{record.notes}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-medium">Reference ID</p>
                        <p>{record.reference_id}</p>
                      </div>
                      <div>
                        <p className="font-medium">Plan Type</p>
                        <p>{record.plan_type}</p>
                      </div>
                      <div>
                        <p className="font-medium">Effective Date</p>
                        <p>{format(new Date(record.effective_date), 'MMM d, yyyy')}</p>
                      </div>
                      <div>
                        <p className="font-medium">Payment Destination</p>
                        <p>{record.payment_destination}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRecord && (
        <VOBCoveredCodes vobRecordId={selectedRecord.id} />
      )}
    </div>
  )
} 